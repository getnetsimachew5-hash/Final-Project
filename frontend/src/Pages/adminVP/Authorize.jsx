import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import AdminVPPortal from './AdminVPPortal';
import StatusBadge from '../../components/StatusBadge';
import PaymentRequestStatus from '../../components/PaymentRequestStatus';

const fmt = (n) => (Number(n) || 0).toLocaleString();

const apiError = (e, fallback) =>
  e.response?.data?.errors?.[0]?.msg || e.response?.data?.message || fallback;

// Payment authorization view. Same data as Endorsed.jsx (GET /admin-vp/batches)
// but focused on the authorization decision: confirm funds availability, then
// Approve (authorize → forwarded to Finance) or Reject with a
// mandatory comment.
export default function Authorize() {
  const [batches, setBatches] = useState([]);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState({});
  const [busy, setBusy] = useState('');

  const setComment = (id) => (e) => setComments(p => ({ ...p, [id]: e.target.value }));

  const load = () =>
    api.get('/admin-vp/batches')
      .then(r => { setBatches(r.data.batches || []); setErr(''); })
      .catch(e => setErr(apiError(e, 'Failed to load endorsed batches')))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const commentMissing = (c) =>
    !c || c.trim().length < 5
      ? 'A comment is MANDATORY (at least 5 characters).'
      : null;

  const authorize = async (id) => {
    const missing = commentMissing(comments[id]);
    if (missing) { setErr(`${missing} Confirm payment availability/authorization in the comment.`); return; }
    setErr(''); setSuccess(''); setBusy('a:' + id);
    try {
      const res = await api.post(`/admin-vp/batches/${id}/authorize`, {
        comment: comments[id].trim(),
      });
      setSuccess(res.data?.message || 'Authorized — forwarded to Finance.');
      setComments(p => ({ ...p, [id]: '' }));
      load();
    } catch (e) { setErr(apiError(e, 'Failed to authorize')); }
    finally { setBusy(''); }
  };

  const reject = async (id) => {
    const missing = commentMissing(comments[id]);
    if (missing) {
      setErr(`${missing} Explain what needs correction so the request can be resubmitted.`);
      return;
    }
    setErr(''); setSuccess(''); setBusy('r:' + id);
    try {
      const res = await api.post(`/admin-vp/batches/${id}/reject`, {
        comment: comments[id].trim(),
      });
      setSuccess(res.data?.message || 'Rejected â€” returned for correction.');
      setComments(p => ({ ...p, [id]: '' }));
      load();
    } catch (e) { setErr(apiError(e, 'Failed to reject')); }
    finally { setBusy(''); }
  };

  return (
    <AdminVPPortal>
      <h1>Payment Authorization</h1>
      <p className="muted">
        Confirm payment authorization and availability, then Approve (forwards directly
        to Finance) or Reject with a mandatory comment.
      </p>

      {err && <p className="error">{err}</p>}
      {success && <p className="notice-ok">âœ… {success}</p>}
      {loading && <p className="muted">Loadingâ€¦</p>}
      {!loading && batches.length === 0 && (
        <p className="muted">No endorsed batches awaiting authorization.</p>
      )}

      {batches.map(b => (
        <div key={b._id} className="batch-card">
          <div className="batch-head">
            <h3>{b.batchName}</h3>
            <StatusBadge status={b.status} />
            <span className="muted">{b.semester} Â· {b.academicYear}</span>
          </div>
          <p>{b.studentCount} student(s) Â· {fmt(b.totalAmount)} ETB</p>

          <ul className="student-review-list">
            {(b.requests || []).map(r => (
              <li key={r._id} className="student-review-item">
                <span className="student-name">{r.student?.fullName || 'â€”'}</span>
                <small className="muted">{r.student?.institutionalId}</small>
<small className="muted">
                    {r.student?.program || '—'} · {r.student?.year ? "Year " + r.student.year : "—"} · 📞 {r.student?.phone || '—'} · ✉️ {r.student?.email || '—'}
                  </small>
                <span className="chip">{fmt(r.amount)} ETB</span>
                <PaymentRequestStatus status={r.status} />
              </li>
            ))}
          </ul>

          <div className="batch-actions">
            <Link className="btn secondary" to="/admin-vp/review">Administrative review checklist â†’</Link>
          </div>

          <textarea
            className="comment"
            placeholder="Authorization comment â€” MANDATORY for Approve (confirm availability) AND Reject (reason). Minimum 5 characters."
            value={comments[b._id] || ''}
            onChange={setComment(b._id)}
          />

          <div className="batch-actions">
            <button className="btn primary" onClick={() => authorize(b._id)} disabled={busy === 'a:' + b._id}>
              {busy === 'a:' + b._id ? 'Authorizing…' : 'Authorize → Forward to Finance'}
            </button>
            <button className="btn danger" onClick={() => reject(b._id)} disabled={busy === 'r:' + b._id}>
              {busy === 'r:' + b._id ? 'Rejectingâ€¦' : 'Reject â†’ Return for Correction'}
            </button>
          </div>
        </div>
      ))}
    </AdminVPPortal>
  );
}
