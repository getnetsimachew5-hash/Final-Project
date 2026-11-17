import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../api/axios';
import StatusBadge from '../../../components/StatusBadge';

const money = (n) => (Number(n) || 0).toLocaleString();
const apiError = (e, fallback) =>
  e.response?.data?.errors?.[0]?.msg || e.response?.data?.message || fallback;

const ROLE_LABEL = {
  cs_dept: 'CS Department',
  college: 'College Office',
  academic_vp: 'Academic VP Office',
  admin_vp: 'Administrative VP Office',
  industrial: 'Former staff',
  finance: 'Finance Office',
  admin: 'System Administrator',
};

const ACTION_LABEL = {
  created: 'Batch created by the CS Department',
  forwarded_to_college: 'Forwarded to the College Office',
  endorsed: 'Academic VP endorsed → sent to Admin VP',
  payment_confirmed: 'Payment availability confirmed by Admin VP',
  authorized: 'Authorized and forwarded directly to Finance',
  verified: 'Supporting information verified and forwarded to Finance',
  return_batch_to_admin_vp: 'Returned to Admin VP for correction',
  returned_to_admin_vp: 'Returned to Admin VP for correction',
  returned_to_academic_vp: 'Returned to Academic VP for correction',
  returned_to_college: 'Returned to College Office for correction',
  batch_paid: 'Batch paid by Finance',
  process_payment: 'Payment processed by Finance',
};

const STATUS_NOTE = {
  pending_admin_vp: 'Waiting for the Administrative VP to forward.',
  pending_finance: 'With the Finance Office — payment processing.',
  paid: 'Payment completed.',
  pending_academic_vp: 'Back with the Academic VP for correction.',
};

// FUNCTION 7 — View approval history.
// Uses the full batch trail so the Admin VP can see the Academic VP hand-off,
// their own authorization, and what Finance did next.
export default function Step7History({ batchId, onStartAnother }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');

    api.get(`/admin-vp/batches/${batchId}/history`)
      .then((r) => { if (alive) setData(r.data); })
      .catch((e) => { if (alive) setError(apiError(e, 'Failed to load approval history')); })
      .finally(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  }, [batchId]);

  if (loading) return <p className="muted">Loading approval history…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!data?.batch) return <p className="muted">No history available for this batch.</p>;

  const { batch, summary } = data;
  const trail = [...(batch.history || [])].sort((a, z) => new Date(a.at || 0) - new Date(z.at || 0));

  return (
    <>
      <div className="vp-panel-head">
        <h2>7. Approval history</h2>
        <p className="muted">
          Batch <b>{batch.batchName}</b> · {batch.semester} {batch.academicYear} ·{' '}
          <StatusBadge status={batch.status} />
        </p>
      </div>

      <div className="vp-summary-grid">
        <div className="vp-summary"><span>Students</span><b>{summary?.studentCount ?? 0}</b></div>
        <div className="vp-summary"><span>Requested</span><b>{money(summary?.totalAmount)} ETB</b></div>
        <div className="vp-summary">
          <span>Authorized</span>
          <b>{batch.authorizedAmount ? `${money(batch.authorizedAmount)} ETB` : '—'}</b>
        </div>
        <div className="vp-summary">
          <span>Decision</span>
          <b>{batch.adminVpDecision ? batch.adminVpDecision.toUpperCase() : '—'}</b>
        </div>
      </div>

      {STATUS_NOTE[batch.status] && (
        <p className="vp-status-note">{STATUS_NOTE[batch.status]}</p>
      )}

      <ol className="vp-timeline">
        {trail.map((h, i) => (
          <li key={`${h.action}-${i}`} className={`vp-trail-item ${h.actor?.role || 'system'}`}>
            <span className="vp-trail-dot" aria-hidden="true" />
            <div>
              <b>{ACTION_LABEL[h.action] || h.action}</b>
              <small className="muted">
                {h.actor?.fullName || 'System'} · {ROLE_LABEL[h.actor?.role] || 'System'}
                {h.at ? ` · ${new Date(h.at).toLocaleString()}` : ''}
              </small>
              {h.comment && <p className="vp-trail-comment">“{h.comment}”</p>}
            </div>
          </li>
        ))}
        {trail.length === 0 && <li className="muted">No approval events recorded.</li>}
      </ol>

      <div className="batch-actions">
        <Link className="btn secondary" to="/admin-vp/history">Open full history page →</Link>
        {onStartAnother && (
          <button type="button" className="btn primary" onClick={onStartAnother}>
            Start another request
          </button>
        )}
      </div>
    </>
  );
}
