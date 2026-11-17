import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import './MessageCenter.css';

const ROLE_LABELS = {
  student: 'Student',
  cs_dept: 'CS Department',
  college: 'College Office',
  academic_vp: 'Academic Vice President',
  admin_vp: 'Administrative Vice President',
  finance: 'Finance Office',
  admin: 'System Administrator',
  industrial: 'Industrial Supervisor',
};

const BATCH_PAGE = {
  student: '/student/status',
  cs_dept: '/cs-dept/forward',
  college: '/college/pending',
  academic_vp: '/academic-vp/approved',
  admin_vp: '/admin-vp/endorsed',
  finance: '/finance/batch',
  admin: '/admin',
};

// A message can carry a link that is meant for its recipient. When the sender
// opens the same conversation, that link may point to a page their role cannot
// access. Only follow links under the viewer's own portal; otherwise fall back
// to the role's batch page.
const ROLE_PREFIX = {
  student: '/student',
  cs_dept: '/cs-dept',
  college: '/college',
  academic_vp: '/academic-vp',
  admin_vp: '/admin-vp',
  finance: '/finance',
  admin: '/admin',
};

function roleLabel(role) {
  return ROLE_LABELS[role] || role || 'System';
}

function shortDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

function iconFor(n) {
  const t = `${n.category || ''} ${n.type || ''} ${n.subject || ''} ${n.message || ''}`.toLowerCase();
  if (t.includes('reject') || t.includes('missing') || t.includes('correct') || t.includes('return')) return '📝';
  if (t.includes('paid') || t.includes('payment')) return '✅';
  if (t.includes('resubmit')) return '↩';
  if (t.includes('batch') || t.includes('forward')) return '📋';
  if (t.includes('account')) return '👤';
  return '💬';
}

export default function MessageCenter({
  title = 'Messages',
  subtitle = 'Send corrections, questions and replies between offices and students. Every message stays in one conversation.',
}) {
  const { user } = useAuth();

  const [box, setBox] = useState('inbox');
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [q, setQ] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [unread, setUnread] = useState({ count: 0, actionRequired: 0 });
  const [refreshKey, setRefreshKey] = useState(0);

  const [contacts, setContacts] = useState({ roles: [] });
  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState({
    toRole: '',
    subject: '',
    message: '',
    actionRequired: false,
  });
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentQuery, setStudentQuery] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [studentSearching, setStudentSearching] = useState(false);

  const [thread, setThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyAction, setReplyAction] = useState(false);
  const [sending, setSending] = useState(false);

  const isStudent = user?.role === 'student';
  const myId = user?.id || user?._id;

  const refreshUnread = async () => {
    try {
      const r = await api.get('/messages/unread-count');
      setUnread(r.data || { count: 0, actionRequired: 0 });
    } catch { /* ignore */ }
  };

  useEffect(() => {
    api.get('/messages/contacts')
      .then(r => setContacts(r.data || { roles: [] }))
      .catch(() => setContacts({ roles: [] }));
    refreshUnread();
  }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await api.get('/messages', {
        params: {
          box,
          page,
          limit: 20,
          q: q.trim() || undefined,
          unread: unreadOnly && box === 'inbox' ? 'true' : undefined,
        },
      });
      const data = r.data || {};
      setList(Array.isArray(data.messages) ? data.messages : []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
      refreshUnread();
    } catch (e) {
      setList([]);
      setError(e.response?.data?.message || 'Failed to load messages.');
    } finally {
      setLoading(false);
    }
  };

  // Debounced so typing in the search box does not fire a request per key.
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box, page, q, unreadOnly, refreshKey]);

  // Staff student picker (only when "Student (choose one)" is selected).
  useEffect(() => {
    if (!composeOpen || compose.toRole !== 'student' || isStudent) return undefined;
    const t = setTimeout(async () => {
      setStudentSearching(true);
      try {
        const r = await api.get('/messages/students', { params: { q: studentQuery.trim() || undefined } });
        setStudentResults(Array.isArray(r.data?.students) ? r.data.students : []);
      } catch {
        setStudentResults([]);
      } finally {
        setStudentSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [composeOpen, compose.toRole, studentQuery, isStudent]);

  const openThread = async (message) => {
    if (!message) return;
    setThreadLoading(true);
    setError('');
    try {
      const id = message.threadId || message._id;
      const r = await api.get(`/messages/threads/${id}`);
      setThread(r.data);
      setReplyText('');
      setReplyAction(false);
      if (box === 'inbox') {
        setList(prev => prev.map(n => (
          String(n._id) === String(message._id) ? { ...n, isRead: true } : n
        )));
      }
      refreshUnread();
    } catch (e) {
      setThread(null);
      setError(e.response?.data?.message || 'Failed to open the conversation.');
    } finally {
      setThreadLoading(false);
    }
  };

  const closeThread = () => {
    setThread(null);
    setReplyText('');
    setReplyAction(false);
  };

  const markAllRead = async () => {
    const ids = list.filter(n => !n.isRead).map(n => n._id);
    if (ids.length === 0) return;
    try {
      await api.post('/messages/read', { ids });
      setList(prev => prev.map(n => ({ ...n, isRead: true })));
      refreshUnread();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to mark messages as read.');
    }
  };

  const openCompose = () => {
    setCompose({ toRole: '', subject: '', message: '', actionRequired: false });
    setSelectedStudent(null);
    setStudentQuery('');
    setStudentResults([]);
    setComposeOpen(true);
    setError('');
    setSuccess('');
  };

  const chooseStudent = (student) => {
    setSelectedStudent(student);
    setStudentQuery('');
    setStudentResults([]);
  };

  const sendNew = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!compose.toRole) { setError('Choose who should receive the message.'); return; }
    if (compose.toRole === 'student' && !selectedStudent) {
      setError('Choose the student who should receive the message.');
      return;
    }
    if (!compose.message.trim()) { setError('Type a message before sending.'); return; }

    setSending(true);
    try {
      const res = await api.post('/messages', {
        toRole: compose.toRole,
        toUserId: compose.toRole === 'student' ? selectedStudent._id : undefined,
        subject: compose.subject.trim() || undefined,
        message: compose.message.trim(),
        actionRequired: compose.actionRequired,
        studentId: compose.toRole === 'student' ? selectedStudent._id : undefined,
      });
      setSuccess(res.data?.message || 'Message sent.');
      setComposeOpen(false);
      setBox('sent');
      setPage(1);
      setRefreshKey(k => k + 1);
      if (res.data?.threadId) {
        await openThread({ threadId: res.data.threadId });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send the message.');
    } finally {
      setSending(false);
    }
  };

  const sendReply = async (e) => {
    e.preventDefault();
    if (!thread) return;
    if (!replyText.trim()) { setError('Type a reply before sending.'); return; }

    setSending(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.post('/messages', {
        threadId: thread.threadId,
        message: replyText.trim(),
        actionRequired: replyAction,
      });
      setReplyText('');
      setReplyAction(false);
      setSuccess(res.data?.message || 'Reply sent.');
      await openThread({ threadId: thread.threadId });
      setRefreshKey(k => k + 1);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send the reply.');
    } finally {
      setSending(false);
    }
  };

  const targetRoles = useMemo(
    () => (contacts.roles || []).filter(r => r.role !== 'student' || !isStudent),
    [contacts.roles, isStudent],
  );

  return (
    <div className="msg-page">
      <div className="msg-head">
        <div>
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>
        </div>
        <div className="msg-head-actions">
          {unread.actionRequired > 0 && (
            <span className="msg-head-badge">{unread.actionRequired} waiting for correction</span>
          )}
          <button className="btn primary" onClick={openCompose}>＋ New message</button>
        </div>
      </div>

      {error && <p className="error" style={{ whiteSpace: 'pre-line' }}>{error}</p>}
      {success && <p className="notice-ok" style={{ whiteSpace: 'pre-line' }}>✅ {success}</p>}

      <div className="msg-toolbar">
        <div className="msg-tabs">
          <button
            type="button"
            className={box === 'inbox' ? 'active' : ''}
            onClick={() => { setBox('inbox'); setPage(1); closeThread(); }}
          >
            Inbox {unread.count > 0 && <span className="msg-tab-count">{unread.count}</span>}
          </button>
          <button
            type="button"
            className={box === 'sent' ? 'active' : ''}
            onClick={() => { setBox('sent'); setPage(1); closeThread(); }}
          >
            Sent
          </button>
        </div>

        <input
          className="msg-search"
          placeholder="Search subject, message or sender…"
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1); }}
        />

        {box === 'inbox' && (
          <label className="msg-check">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={e => { setUnreadOnly(e.target.checked); setPage(1); }}
            />
            Unread only
          </label>
        )}

        {box === 'inbox' && unread.count > 0 && (
          <button type="button" className="btn secondary" onClick={markAllRead}>
            ✓ Mark page read
          </button>
        )}
      </div>

      <div className="msg-layout">
        <div className="msg-list-pane">
          {loading ? (
            <div className="msg-empty"><p>Loading…</p></div>
          ) : list.length === 0 ? (
            <div className="msg-empty">
              <span className="msg-empty-ico">📭</span>
              <p>{box === 'inbox'
                ? 'No messages yet. When an office asks you for corrected information, it will appear here.'
                : 'You have not sent any messages yet.'}</p>
            </div>
          ) : (
            <ul className="msg-list">
              {list.map(n => {
                const selected = thread
                  && (String(thread.threadId) === String(n.threadId) || String(thread.threadId) === String(n._id));
                return (
                  <li
                    key={n._id}
                    className={`msg-item ${box === 'inbox' && !n.isRead ? 'unread' : ''} ${selected ? 'selected' : ''}`}
                    onClick={() => openThread(n)}
                  >
                    <div className="msg-item-top">
                      <span className="msg-item-who">
                        <span className="msg-item-ico">{iconFor(n)}</span>
                        {box === 'inbox'
                          ? (n.senderLabel || 'System')
                          : `To: ${n.recipientRole === 'student' && n.studentName && n.recipientCount === 1
                            ? n.studentName
                            : (n.recipientLabel || 'Recipient')}`}
                      </span>
                      <span className="msg-time">{shortDate(n.createdAt)}</span>
                    </div>
                    <div className="msg-item-subject">
                      {n.subject || String(n.message || '').split('\n')[0]}
                    </div>
                    <div className="msg-item-preview">{n.message}</div>
                    <div className="msg-item-badges">
                      {n.category && n.category !== 'notification' && (
                        <span className="msg-badge">{n.category}</span>
                      )}
                      {n.actionRequired && !n.resolvedAt && (
                        <span className="msg-badge action">Action required</span>
                      )}
                      {n.resolvedAt && <span className="msg-badge resolved">Resolved</span>}
                      {box === 'sent' && n.recipientCount > 1 && (
                        <span className="msg-badge">{n.recipientCount} recipients</span>
                      )}
                      {box === 'inbox' && !n.isRead && <span className="msg-dot" title="Unread" />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {pages > 1 && (
            <div className="msg-pagination">
              <button
                type="button"
                className="btn secondary"
                disabled={page <= 1 || loading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                ← Previous
              </button>
              <span className="muted">Page {page} of {pages} · {total} message(s)</span>
              <button
                type="button"
                className="btn secondary"
                disabled={page >= pages || loading}
                onClick={() => setPage(p => Math.min(pages, p + 1))}
              >
                Next →
              </button>
            </div>
          )}
        </div>

        <div className="msg-thread-pane">
          {threadLoading ? (
            <div className="msg-empty"><p>Opening conversation…</p></div>
          ) : !thread ? (
            <div className="msg-empty">
              <span className="msg-empty-ico">💬</span>
              <p>Select a message to read the conversation and reply.</p>
            </div>
          ) : (
            <div className="msg-thread">
              <div className="msg-thread-head">
                <div>
                  <h2>{thread.subject || 'Conversation'}</h2>
                  <div className="msg-participants">
                    {(thread.participants || []).map(p => (
                      <span key={p.role} className="msg-participant">
                        {p.name ? `${p.name} · ${p.label}` : p.label}
                      </span>
                    ))}
                  </div>
                </div>
                <button type="button" className="btn secondary" onClick={closeThread}>Close</button>
              </div>

              {(() => {
                const link = thread.context?.link;
                const prefix = ROLE_PREFIX[user?.role];
                const ownLink = link && (!prefix || link.startsWith(prefix)) ? link : null;
                const relatedLink = ownLink
                  || (thread.context?.batch ? BATCH_PAGE[user?.role] : null);
                return relatedLink ? (
                  <Link className="msg-context-link" to={relatedLink}>
                    Open the related page →
                  </Link>
                ) : null;
              })()}

              <div className="msg-thread-body">
                {(thread.messages || []).map(m => {
                  const mine = m.sender && String(m.sender) === String(myId);
                  return (
                    <div key={m._id} className={`msg-bubble ${mine ? 'mine' : 'theirs'}`}>
                      <div className="msg-bubble-head">
                        <strong>
                          {m.senderName || (m.senderRole ? roleLabel(m.senderRole) : 'System')}
                        </strong>
                        {m.senderRole && <span className="muted"> · {roleLabel(m.senderRole)}</span>}
                        <span className="msg-time">{shortDate(m.createdAt)}</span>
                      </div>
                      <p className="msg-text">{m.message}</p>
                      <div className="msg-bubble-badges">
                        {m.category && m.category !== 'notification' && (
                          <span className="msg-badge">{m.category}</span>
                        )}
                        {m.actionRequired && !m.resolvedAt && (
                          <span className="msg-badge action">Action required</span>
                        )}
                        {m.resolvedAt && <span className="msg-badge resolved">Resolved</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {thread.canReply ? (
                <form className="msg-reply" onSubmit={sendReply}>
                  <label htmlFor="msg-reply-text">Reply</label>
                  <textarea
                    id="msg-reply-text"
                    rows={4}
                    placeholder="Type your reply — corrected information, a question, or a request for another correction…"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                  />
                  <label className="msg-check">
                    <input
                      type="checkbox"
                      checked={replyAction}
                      onChange={e => setReplyAction(e.target.checked)}
                    />
                    This reply asks for another correction (keep the conversation open)
                  </label>
                  <div className="msg-reply-actions">
                    <button type="submit" className="btn primary" disabled={sending}>
                      {sending ? 'Sending…' : 'Send reply'}
                    </button>
                  </div>
                </form>
              ) : (
                <p className="muted" style={{ padding: '0.75rem 1rem' }}>
                  This is a system notification. Use “New message” to contact an office.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {composeOpen && (
        <div className="msg-modal-backdrop" role="presentation" onMouseDown={e => {
          if (e.target === e.currentTarget) setComposeOpen(false);
        }}>
          <div className="msg-modal" role="dialog" aria-modal="true" aria-label="New message">
            <div className="msg-modal-head">
              <h2>New message</h2>
              <button type="button" className="btn secondary" onClick={() => setComposeOpen(false)}>Close</button>
            </div>

            <form onSubmit={sendNew}>
              <label htmlFor="msg-to">To</label>
              <select
                id="msg-to"
                value={compose.toRole}
                onChange={e => {
                  setCompose(prev => ({ ...prev, toRole: e.target.value }));
                  setSelectedStudent(null);
                  setStudentQuery('');
                  setStudentResults([]);
                }}
              >
                <option value="">Choose a recipient…</option>
                {targetRoles.map(r => (
                  <option key={r.role} value={r.role} disabled={r.count === 0}>
                    {r.label}{r.count ? ` (${r.count} active)` : ' (no active users)'}
                  </option>
                ))}
              </select>

              {compose.toRole === 'student' && (
                <div className="msg-student-picker">
                  {selectedStudent ? (
                    <div className="msg-student-selected">
                      <span>
                        <strong>{selectedStudent.fullName}</strong>
                        {' '}· {selectedStudent.institutionalId || selectedStudent.username}
                        {selectedStudent.program ? ` · ${selectedStudent.program}` : ''}
                      </span>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => setSelectedStudent(null)}
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        placeholder="Search student by name, ID, username or program…"
                        value={studentQuery}
                        onChange={e => setStudentQuery(e.target.value)}
                      />
                      {studentSearching && <p className="muted">Searching…</p>}
                      {!studentSearching && studentResults.length > 0 && (
                        <ul className="msg-student-results">
                          {studentResults.map(s => (
                            <li key={s._id}>
                              <button type="button" onClick={() => chooseStudent(s)}>
                                <strong>{s.fullName}</strong>
                                <span>{s.institutionalId || s.username}</span>
                                {s.program && <span>{s.program}</span>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {!studentSearching && studentQuery && studentResults.length === 0 && (
                        <p className="muted">No active student matched that search.</p>
                      )}
                    </>
                  )}
                </div>
              )}

              <label htmlFor="msg-subject">Subject (optional)</label>
              <input
                id="msg-subject"
                placeholder="e.g. Correct the registered TeleBirr phone for these students"
                value={compose.subject}
                onChange={e => setCompose(prev => ({ ...prev, subject: e.target.value }))}
              />

              <label htmlFor="msg-body">Message</label>
              <textarea
                id="msg-body"
                rows={6}
                placeholder="Explain exactly what is missing or incorrect, and what the recipient should do next."
                value={compose.message}
                onChange={e => setCompose(prev => ({ ...prev, message: e.target.value }))}
              />

              <label className="msg-check">
                <input
                  type="checkbox"
                  checked={compose.actionRequired}
                  onChange={e => setCompose(prev => ({ ...prev, actionRequired: e.target.checked }))}
                />
                This is a correction request (stays open until the recipient answers)
              </label>

              <div className="msg-modal-actions">
                <button type="button" className="btn secondary" onClick={() => setComposeOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={sending}>
                  {sending ? 'Sending…' : 'Send message'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
