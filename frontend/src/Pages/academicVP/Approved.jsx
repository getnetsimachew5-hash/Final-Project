import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import AcademicVPPortal from './AcademicVPPortal';
import StatusBadge from '../../components/StatusBadge';
import StudentInfoTable from '../../components/StudentInfoTable';

const fmt = (n) => (Number(n) || 0).toLocaleString();

// The backend requires a comment of at least five characters for both actions.
const MIN_COMMENT = 5;
const apiError = (e, fallback) =>
  e.response?.data?.errors?.[0]?.msg ||
  e.response?.data?.message ||
  fallback;

/**
 * Functions 5 + 6 + 7 — the decision page.
 *   5  Endorse or reject the request  → POST /academic-vp/batches/:id/endorse|reject
 *   6  Provide comments when rejecting → mandatory comment box (min 5 chars,
 *      validated here AND by express-validator on the backend)
 *   7  Forward endorsed requests       → endorse sets status 'pending_admin_vp',
 *      notifies the Admin VP and records history/audit.
 */
export default function Approved() {
  const [batches, setBatches] = useState([]);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState({}); // per batch
  const [busy, setBusy] = useState('');

  const setComment = (id) => (e) => setComments(p => ({ ...p, [id]: e.target.value }));

  const load = () =>
    api.get('/academic-vp/batches')
      .then(r => { setBatches(r.data.batches || []); setErr(''); })
      .catch(e => setErr(apiError(e, 'Failed to load college-approved requests')))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const commentMissing = (c) => {
    if (!c) return 'A review comment is required (at least 5 characters).';
    if (c.length < MIN_COMMENT) return `The review comment must be at least ${MIN_COMMENT} characters.`;
    return null;
  };

  // 4. Endorse eligible request
  const endorse = async (id) => {
    const c = (comments[id] || '').trim();
    const missing = commentMissing(c);
    if (missing) { setErr(missing); return; }
    setErr(''); setSuccess(''); setBusy('e:' + id);
    try {
      const res = await api.post(`/academic-vp/batches/${id}/endorse`, { comment: c });
      setSuccess(res.data?.message || 'Batch endorsed and forwarded to the Administrative VP.');
      setComments(p => ({ ...p, [id]: '' }));
      load();
    } catch (e) { setErr(apiError(e, 'Failed to endorse the request')); }
    finally { setBusy(''); }
  };

  // 5. Reject if requirements are not satisfied + 6. Provide rejection comments
  const reject = async (id) => {
    const c = (comments[id] || '').trim();
    const missing = commentMissing(c);
    if (missing) {
      setErr(`${missing} Explain what is missing or incorrect so the College can correct it and send it again.`);
      return;
    }
    setErr(''); setSuccess(''); setBusy('r:' + id);
    try {
      const res = await api.post(`/academic-vp/batches/${id}/reject`, { comment: c });
      setSuccess(res.data?.message || 'Batch returned to the College Office for correction.');
      setComments(p => ({ ...p, [id]: '' }));
      load();
    } catch (e) { setErr(apiError(e, 'Failed to reject the request')); }
    finally { setBusy(''); }
  };

  return (
    <AcademicVPPortal>
      <div className="avp-review-page">
        <h1>Endorse / Reject Requests</h1>
        <p className="avp-review-intro">
          Review each request carefully. Use the <b>Endorse</b> button only when the student is
          academically eligible and the supporting documents are complete. Use <b>Reject</b> when
          something is missing or incorrect, and explain exactly what the College must fix.
        </p>

        <div className="avp-help">
          <strong>What each button does</strong>
          <ul>
            <li>
              <b>Review supporting documents</b> opens the return forms and completion letters
              attached to the batch. It does not change the request.
            </li>
            <li>
              <b>Endorse &amp; forward to Admin VP</b> records your approval and sends the request
              to the Administrative VP. You cannot endorse the same request again after it moves.
            </li>
            <li>
              <b>Reject &amp; return to College</b> sends the request back for correction. A
              comment of at least {MIN_COMMENT} characters is required so the College knows what
              to fix.
            </li>
          </ul>
        </div>

        {err && <p className="error">{err}</p>}
        {success && <p className="notice-ok">✅ {success}</p>}
        {loading && <p className="muted">Loading requests…</p>}

        {!loading && batches.length === 0 && (
          <p className="muted">No College-approved requests are waiting for academic review.</p>
        )}

        {batches.map(b => {
          const actionable = b.status === 'pending_academic_vp';
          const working = Boolean(busy);
          return (
            <div key={b._id} className={`batch-card avp-review-card${actionable ? '' : ' completed'}`}>
              <div className="batch-head">
                <h3>{b.batchName}</h3>
                <StatusBadge status={b.status} />
                <span className="muted">{b.semester} · {b.academicYear}</span>
              </div>
              <p>{b.studentCount} student(s) · {fmt(b.totalAmount)} ETB</p>
              <StudentInfoTable
                requests={b.requests}
                showAmount
                showDuration
                showStatus
              />

              {b.rejectionReason && b.status === 'pending_academic_vp' && (
                <p className="muted">↩ Previously returned: “{b.rejectionReason}”</p>
              )}

              {!actionable && (
                <p className="avp-completed-note">
                  ✅ This request has already moved on from this office. No action can be taken here.
                </p>
              )}

              {/* 3. Review supporting documents link */}
              <div className="batch-actions">
                <Link className="btn secondary" to="/academic-vp/documents">
                  📄 Review supporting documents
                </Link>
              </div>

              {/* 5/6. Comments are mandatory (min. 5 characters) */}
              <label className="avp-comment-label" htmlFor={`avp-comment-${b._id}`}>
                Academic review comment <span>(required for both actions)</span>
              </label>
              <textarea
                id={`avp-comment-${b._id}`}
                className="comment"
                placeholder="Explain the academic review decision. Minimum 5 characters."
                value={comments[b._id] || ''}
                onChange={setComment(b._id)}
                disabled={!actionable || working}
              />

              <div className="batch-actions">
                {/* 4. Endorse eligible request */}
                <button
                  className="btn primary"
                  onClick={() => endorse(b._id)}
                  disabled={!actionable || working}
                  title="Approve academic eligibility and forward this request to the Administrative VP"
                >
                  {busy === 'e:' + b._id ? 'Endorsing…' : '✅ Endorse & forward to Admin VP'}
                </button>
                {/* 5+6. Reject with comments → Previous actor (College) */}
                <button
                  className="btn danger"
                  onClick={() => reject(b._id)}
                  disabled={!actionable || working}
                  title="Return this request to the College Office for correction with your comment"
                >
                  {busy === 'r:' + b._id ? 'Returning…' : '↩ Reject & return to College'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </AcademicVPPortal>
  );
}
