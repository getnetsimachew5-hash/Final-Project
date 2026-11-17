import { Fragment, useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import AdminPortal from './AdminPortal';

const PAGE_SIZE = 25;

// Colours for the action badge. Explicit entries win; anything not listed is
// coloured by the keyword rules in `badgeColour` so new workflow actions still
// look meaningful instead of all falling back to grey.
const ACTION_COLORS = {
  create_user:         { bg: '#dbeafe', color: '#1d4ed8' },
  approve_user:        { bg: '#dcfce7', color: '#15803d' },
  reject_user:         { bg: '#fee2e2', color: '#dc2626' },
  verify_student:      { bg: '#dbeafe', color: '#1d4ed8' },
  update_user:         { bg: '#fef3c7', color: '#b45309' },
  delete_user:         { bg: '#fee2e2', color: '#dc2626' },
  backup_database:     { bg: '#f3e8ff', color: '#7c3aed' },
  delete_organization: { bg: '#fee2e2', color: '#dc2626' },
  update_daily_rate:   { bg: '#f3e8ff', color: '#7c3aed' },
};

const NEUTRAL = { bg: '#f1f5f9', color: '#475569' };

function badgeColour(action = '') {
  if (ACTION_COLORS[action]) return ACTION_COLORS[action];
  if (/reject|delete|cancel|suspend/.test(action)) return { bg: '#fee2e2', color: '#dc2626' };
  if (/approve|paid|confirmed|complete|success/.test(action)) return { bg: '#dcfce7', color: '#15803d' };
  if (/verify|endorse|authorize/.test(action)) return { bg: '#dbeafe', color: '#1d4ed8' };
  if (/update|edit|resubmit/.test(action)) return { bg: '#fef3c7', color: '#b45309' };
  if (/pay|telebirr|finance|amount/.test(action)) return { bg: '#ccfbf1', color: '#0f766e' };
  if (/backup|setting/.test(action)) return { bg: '#f3e8ff', color: '#7c3aed' };
  return NEUTRAL;
}

function ActionBadge({ action }) {
  const c = badgeColour(action);
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.2rem 0.65rem',
      borderRadius: 999,
      fontSize: '0.73rem',
      fontWeight: 700,
      letterSpacing: '0.3px',
      background: c.bg,
      color: c.color,
      whiteSpace: 'nowrap',
    }}>
      {action?.replace(/_/g, ' ') || '—'}
    </span>
  );
}

// Actions the backend already records — used to populate the filter even when
// they do not appear on the current page. The stats endpoint adds any others.
const KNOWN_ACTIONS = [
  'create_user', 'approve_user', 'reject_user', 'verify_student', 'update_user',
  'delete_user', 'backup_database', 'delete_organization', 'update_daily_rate',
  'create_batch', 'update_batch', 'forward_batch', 'approve_batch',
  'endorse_batch', 'authorize_batch', 'reject_batch', 'cancel_batch',
  'confirm_payment', 'process_payment', 'pay_entire_batch',
  'initiate_telebirr_payment', 'confirm_telebirr_payment',
  'submit_return', 'resubmit_return', 'upload_letter', 'verify_return',
  'unverify_return', 'student_update_profile', 'student_verified_self',
  'send_message_to_student', 'approve_student_college', 'reject_student_college',
  'approve_all_students_college', 'request_missing_info_college',
  'forward_approved_students',
];

const fmtDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

const shortId = (id) => (id ? `${String(id).slice(0, 6)}…${String(id).slice(-4)}` : '—');

function safeJson(value) {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

export default function AuditLogs() {
  const [logs, setLogs]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [pages, setPages]     = useState(1);
  const [page, setPage]       = useState(1);
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg]   = useState('');
  const [search, setSearch]   = useState('');
  const [action, setAction]   = useState('');
  const [from, setFrom]       = useState('');
  const [to, setTo]           = useState('');
  const [expanded, setExpanded] = useState(null);

  // Date range shared by the log list and the statistics request.
  const dateQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (from) params.set('startDate', new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set('endDate', new Date(`${to}T23:59:59.999`).toISOString());
    return params;
  }, [from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setErrMsg('');
    try {
      const params = dateQuery();
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (action) params.set('action', action);

      const r = await api.get(`/admin/audit-logs?${params.toString()}`);

      // New shape: { logs, total, page, limit, pages }. A bare array is still
      // accepted so an older backend keeps working.
      if (Array.isArray(r.data)) {
        setLogs(r.data);
        setTotal(r.data.length);
        setPages(1);
      } else {
        setLogs(r.data.logs || []);
        setTotal(r.data.total ?? (r.data.logs || []).length);
        setPages(r.data.pages ?? 1);
      }
    } catch (e) {
      setErrMsg('Could not load audit logs: ' + (e.response?.data?.message || e.message));
      setLogs([]);
      setTotal(0);
      setPages(1);
    } finally {
      setLoading(false);
    }
  }, [page, action, dateQuery]);

  const loadStats = useCallback(async () => {
    try {
      const r = await api.get(`/admin/audit-logs/stats?${dateQuery().toString()}`);
      setStats(r.data);
    } catch {
      // Statistics are supplementary — a failure must not block the log table.
      setStats(null);
    }
  }, [dateQuery]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadStats(); }, [loadStats]);

  // Reset to page 1 whenever a server-side filter changes.
  const changeFilter = (setter) => (e) => {
    setPage(1);
    setter(e.target.value);
  };

  const resetFilters = () => {
    setSearch('');
    setAction('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  // Client-side text filter applies to the rows of the current page.
  const filtered = logs.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(l.action || '').toLowerCase().includes(q) ||
      String(l.user?.fullName || '').toLowerCase().includes(q) ||
      String(l.user?.username || '').toLowerCase().includes(q) ||
      String(l.user?.role || '').toLowerCase().includes(q) ||
      String(l.targetType || '').toLowerCase().includes(q) ||
      String(l.targetId || '').toLowerCase().includes(q)
    );
  });

  const actionOptions = [...new Set([
    ...KNOWN_ACTIONS,
    ...(stats?.byAction || []).map((a) => a._id).filter(Boolean),
    ...logs.map((l) => l.action).filter(Boolean),
  ])].sort();

  const topAction = stats?.byAction?.[0];
  const activeUsers = (stats?.topUsers || []).length;
  const filtersActive = Boolean(action || from || to || search);

  return (
    <AdminPortal>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(1.4rem,3vw,2rem)', fontWeight: 900, color: '#0f172a' }}>
            📋 Audit Logs
          </h1>
          <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            Full history of all admin and system actions
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="🔍 Filter this page…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 220, padding: '0.45rem 0.85rem', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: '0.88rem' }}
          />
          <button className="btn" onClick={() => { load(); loadStats(); }} disabled={loading} style={{ fontSize: '0.88rem' }}>
            {loading ? '⏳ Loading…' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {/* Server-side filters */}
      <div style={{
        display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap',
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
        padding: '0.9rem 1rem', marginBottom: '1rem',
      }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>
          Action
          <select
            value={action}
            onChange={changeFilter(setAction)}
            style={{ padding: '0.4rem 0.6rem', borderRadius: 7, border: '1.5px solid #cbd5e1', fontSize: '0.85rem', minWidth: 190, background: '#fff' }}
          >
            <option value="">All actions</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>
          From
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={changeFilter(setFrom)}
            style={{ padding: '0.38rem 0.55rem', borderRadius: 7, border: '1.5px solid #cbd5e1', fontSize: '0.85rem' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>
          To
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={changeFilter(setTo)}
            style={{ padding: '0.38rem 0.55rem', borderRadius: 7, border: '1.5px solid #cbd5e1', fontSize: '0.85rem' }}
          />
        </label>
        {filtersActive && (
          <button className="btn" onClick={resetFilters} style={{ fontSize: '0.82rem', background: '#f1f5f9' }}>
            ✕ Clear filters
          </button>
        )}
      </div>

      {errMsg && <div className="error">{errMsg}</div>}

      {/* Summary strip */}
      {!loading && (
        <div style={{
          background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
          padding: '0.75rem 1.25rem', marginBottom: '1.25rem',
          display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center',
          fontSize: '0.86rem', color: '#475569',
        }}>
          <span>📊 <strong>{total.toLocaleString()}</strong> {filtersActive ? 'matching events' : 'total events'}</span>
          <span>🔍 Showing <strong>{filtered.length}</strong> on this page</span>
          <span>📄 Page <strong>{page}</strong> of <strong>{pages}</strong></span>
          {topAction && (
            <span>🏆 Most frequent: <strong>{topAction._id?.replace(/_/g, ' ')}</strong> ({topAction.count})</span>
          )}
          {activeUsers > 0 && <span>👥 <strong>{activeUsers}</strong> active user(s)</span>}
          {logs[0]?.at && (
            <span>🕐 Latest: <strong>{fmtDateTime(logs[0].at)}</strong></span>
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading audit logs…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
          {logs.length === 0 ? '📭 No audit logs recorded for these filters.' : '🔍 No rows on this page match your search.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Time &amp; Date</th>
                <th>Performed By</th>
                <th>Action</th>
                <th>Target</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l, i) => {
                const canExpand = Boolean(l.meta || l.targetId);
                const isOpen = expanded === l._id;
                return (
                  <Fragment key={l._id}>
                    <tr
                      role={canExpand ? 'button' : undefined}
                      tabIndex={canExpand ? 0 : undefined}
                      aria-expanded={canExpand ? isOpen : undefined}
                      style={{ cursor: canExpand ? 'pointer' : 'default', background: isOpen ? '#f8fafc' : undefined }}
                      onClick={() => canExpand && setExpanded(isOpen ? null : l._id)}
                      onKeyDown={(e) => {
                        if (!canExpand) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpanded(isOpen ? null : l._id);
                        }
                      }}
                    >
                      <td style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600 }}>
                        {total - ((page - 1) * PAGE_SIZE + i)}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#0f172a' }}>
                          {l.at ? new Date(l.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                          {l.at ? new Date(l.at).toLocaleDateString() : ''}
                        </div>
                      </td>
                      <td>
                        {l.user ? (
                          <>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0f172a' }}>
                              {l.user.fullName || l.user.username || 'Unknown user'}
                            </div>
                            <div style={{ fontSize: '0.76rem', color: '#64748b' }}>{l.user.role || '—'}</div>
                          </>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>System</span>
                        )}
                      </td>
                      <td><ActionBadge action={l.action} /></td>
                      <td style={{ fontSize: '0.84rem', color: '#475569', whiteSpace: 'nowrap' }}>
                        <div>{l.targetType || '—'}</div>
                        {l.targetId && (
                          <div style={{ fontSize: '0.74rem', color: '#94a3b8', fontFamily: 'monospace' }} title={String(l.targetId)}>
                            {shortId(l.targetId)}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                        {canExpand ? (isOpen ? '▾ click to collapse' : '▸ click to expand') : '—'}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr style={{ background: '#f8fafc' }}>
                        <td colSpan={6} style={{ padding: '0.75rem 1.25rem' }}>
                          <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.4rem' }}>
                            <strong>Target ID:</strong>{' '}
                            <span style={{ fontFamily: 'monospace' }}>{l.targetId || '—'}</span>
                          </div>
                          <div style={{
                            background: '#1e293b', color: '#e2e8f0',
                            borderRadius: 8, padding: '0.85rem 1rem',
                            fontSize: '0.82rem', fontFamily: 'monospace',
                            whiteSpace: 'pre-wrap', maxHeight: 220, overflowY: 'auto',
                          }}>
                            {l.meta ? safeJson(l.meta) : 'No extra details recorded.'}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button className="btn" onClick={() => setPage(1)} disabled={page <= 1} style={{ fontSize: '0.82rem', background: '#f1f5f9' }}>« First</button>
          <button className="btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ fontSize: '0.82rem', background: '#f1f5f9' }}>‹ Prev</button>
          <span style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>Page {page} of {pages}</span>
          <button className="btn" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} style={{ fontSize: '0.82rem', background: '#f1f5f9' }}>Next ›</button>
          <button className="btn" onClick={() => setPage(pages)} disabled={page >= pages} style={{ fontSize: '0.82rem', background: '#f1f5f9' }}>Last »</button>
        </div>
      )}
    </AdminPortal>
  );
}
