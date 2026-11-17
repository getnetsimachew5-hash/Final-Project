import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import AcademicVPPortal from './AcademicVPPortal';
import StatusBadge from '../../components/StatusBadge';
import StudentInfoTable from '../../components/StudentInfoTable';

const fmt = (n) => (Number(n) || 0).toLocaleString();

const apiError = (e, fallback) =>
  e.response?.data?.errors?.[0]?.msg || e.response?.data?.message || fallback;

// Focused academic-eligibility checklist view. Same data source as Approved.jsx
// (GET /academic-vp/batches) but framed as an eligibility checklist, with
// quick Endorse / Reject actions per batch.
/**
 * Functions 3 + 4 — Review academic eligibility & check supporting documents.
 * Uses the same data source as Approved.jsx (GET /academic-vp/batches) but
 * framed as an eligibility checklist, with quick Endorse / Reject actions.
 */
export default function Eligibility() {
  const [batches, setBatches] = useState([]);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState({});
  const [busy, setBusy] = useState('');

  const setComment = (id) => (e) => setComments(p => ({ ...p, [id]: e.target.value }));

  const load = () =>
    api.get('/academic-vp/batches')
      .then(r => { setBatches(r.data.batches || []); setErr(''); })
      .catch(e => setErr(apiError(e, 'Failed to load college-approved requests')))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const commentMissing = (c) =>
    !c || c.trim().length < 5
      ? 'A review comment is MANDATORY (at least 5 characters).'
      : null;

  const endorse = async (id) => {
    const missing = commentMissing(comments[id]);
    if (missing) { setErr(missing); return; }
    setErr(''); setSuccess(''); setBusy('e:' + id);
    try {
      const res = await api.post(`/academic-vp/batches/${id}/endorse`, {
        comment: comments[id].trim(),
      });
      setSuccess(res.data?.message || 'Batch endorsed â€” forwarded to Administrative VP.');
      setComments(p => ({ ...p, [id]: '' }));
      load();
    } catch (e) { setErr(apiError(e, 'Failed to endorse')); }
    finally { setBusy(''); }
  };

  const reject = async (id) => {
    const missing = commentMissing(comments[id]);
    if (missing) {
      setErr(`${missing} Explain what is missing/incorrect so the College can correct it.`);
      return;
    }
    setErr(''); setSuccess(''); setBusy('r:' + id);
    try {
      const res = await api.post(`/academic-vp/batches/${id}/reject`, {
        comment: comments[id].trim(),
      });
      setSuccess(res.data?.message || 'Batch returned to the College Office for correction.');
      setComments(p => ({ ...p, [id]: '' }));
      load();
    } catch (e) { setErr(apiError(e, 'Failed to reject')); }
    finally { setBusy(''); }
  };

  return (
    <AcademicVPPortal>
      <h1>Academic Eligibility Review</h1>
      <p className="muted">
        <strong>Function 2:</strong> Review academic eligibility — check each student has no academic hold,
        internship period is within the registered semester, and all supporting documents are complete.
        Endorse eligible batches or reject with a mandatory comment.
      </p>

      {err && <p className="error">{err}</p>}
      {success && <p className="notice-ok">âœ… {success}</p>}
      {loading && <p className="muted">Loadingâ€¦</p>}
      {!loading && batches.length === 0 && (
        <p className="muted">No college-approved batches awaiting eligibility review.</p>
      )}

      {batches.map(b => (
        <div key={b._id} className="batch-card">
          <div className="batch-head">
            <h3>{b.batchName}</h3>
            <StatusBadge status={b.status} />
            <span className="muted">{b.semester} Â· {b.academicYear}</span>
          </div>
          <p>{b.studentCount} student(s) Â· {fmt(b.totalAmount)} ETB</p>

          <StudentInfoTable
            requests={b.requests}
            showAmount
            showDuration
            showStatus
            emptyText="No student requests are attached to this batch."
          />

          {b.rejectionReason && b.status === 'pending_academic_vp' && (
            <p className="muted">â†© Previously returned: â€œ{b.rejectionReason}â€</p>
          )}

          <div className="batch-actions">
            <Link className="btn secondary" to="/academic-vp/documents">
              Check supporting documents â†’
            </Link>
          </div>

          <textarea
            className="comment"
            placeholder="Eligibility decision comment â€” MANDATORY for Endorse AND Reject (minimum 5 characters)."
            value={comments[b._id] || ''}
            onChange={setComment(b._id)}
          />

          <div className="batch-actions">
            <button className="btn primary" onClick={() => endorse(b._id)} disabled={busy === 'e:' + b._id}>
              {busy === 'e:' + b._id ? 'Endorsingâ€¦' : 'Eligible â€” Endorse â†’ Admin VP'}
            </button>
            <button className="btn danger" onClick={() => reject(b._id)} disabled={busy === 'r:' + b._id}>
              {busy === 'r:' + b._id ? 'Rejectingâ€¦' : 'Not Eligible â€” Reject â†’ Return to College'}
            </button>
          </div>
        </div>
      ))}
    </AcademicVPPortal>
  );
}
