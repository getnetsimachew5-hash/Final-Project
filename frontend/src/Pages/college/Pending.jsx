import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import CollegePortal from './CollegePortal';
import StatusBadge from '../../components/StatusBadge';
import PaymentRequestStatus from '../../components/PaymentRequestStatus';

/**
 * ============================================
 * COLLEGE — REVIEW & APPROVE  (functions 3-6)
 * ============================================
 * 3  verify the request is complete (documents + letters, per student)
 * 4  approve or reject each student INDIVIDUALLY
 * 5  enter the rejection / approval comment (mandatory)
 * 6  forward every approved student ONCE to the Academic VP
 */
export default function Pending() {
  const [batches, setBatches] = useState([]);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState({});   // comment per batch
  const [busy, setBusy] = useState('');

  const setComment = (id) => (e) =>
    setComments(prev => ({ ...prev, [id]: e.target.value }));

  const load = () => {
    setLoading(true);
    return api.get('/college/batches')
      .then(r => {
        const data = r.data.batches || r.data || [];
        // Only what is waiting for THIS office, newest batch first.
        setBatches(data.filter(b => b.status === 'pending_college'));
        setErr('');
      })
      .catch(e => setErr(
        e.response?.data?.message || 'Failed to load the requests from the CS Department.',
      ))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const studentsOf = (b) =>
    b.requests?.length
      ? b.requests
      : (b.students || []).map(s => ({
          student: { _id: s._id, fullName: s.fullName, institutionalId: s.institutionalId },
          status: 'pending_college',
          missingInfo: [],
        }));

  /* ---- function 4 + 5: one student at a time -------------------------- */
  const decideStudent = async (batchId, studentId, kind) => {
    if (!studentId) {
      setErr('This payment request points to a student account that no longer exists — it cannot be reviewed.');
      return;
    }
    const comment = (comments[batchId] || '').trim();
    setSuccess('');
    if (kind === 'approve') {
      // Missing information is identified automatically by the backend if present
    } else {
      if (!comment) {
        setErr('A rejection reason (comment) is MANDATORY — the student is told why.');
        return;
      }
    }
    setErr(''); setBusy(`${batchId}:${studentId}`);
    try {
      const res = await api.post(
        `/college/batches/${batchId}/students/${studentId}/${kind}`, { comment });
      setSuccess(res.data?.message || 'Decision saved.');
      setComments(prev => ({ ...prev, [batchId]: '' }));
      load();
    } catch (e) {
      const data = e.response?.data || {};
      if (data.missingInfo && data.missingInfo.length) {
        setErr(`${data.message || 'Cannot approve — missing information.'}\nMissing: ${data.missingInfo.join(', ')}`);
      } else {
        setErr(data.message || `Could not ${kind} the student.`);
      }
    } finally {
      setBusy('');
    }
  };

  const requestMissingInfo = async (batchId, studentId) => {
    if (!studentId) return;
    setErr(''); setSuccess(''); setBusy(`${batchId}:${studentId}:info`);
    try {
      const res = await api.post(`/college/batches/${batchId}/students/${studentId}/request-info`);
      setSuccess(res.data?.message || 'Missing information notification sent automatically to the student.');
      load();
    } catch (e) {
      setErr(e.response?.data?.message || 'Could not send the missing-information notification.');
    } finally {
      setBusy('');
    }
  };

  // Ask the CS Department to correct/verify every student in this batch.
  // The backend automatically includes the missing-information checklist.
  const requestCsCorrection = async (batch) => {
    const note = window.prompt(
      `Message to the CS Department about batch "${batch.batchName}".\n\n` +
      'Tell them what to correct or verify. Leave blank to send the automatic missing-information checklist.'
    );
    if (note === null) return;
    setErr(''); setSuccess(''); setBusy(`cs:${batch._id}`);
    try {
      const res = await api.post(
        `/college/batches/${batch._id}/request-cs-correction`,
        { message: note },
      );
      setSuccess(res.data?.message || 'Message sent to the CS Department.');
      load();
    } catch (e) {
      setErr(e.response?.data?.message || 'Could not message the CS Department.');
    } finally {
      setBusy('');
    }
  };

  /* ---- bulk approval: everyone whose information is complete ---------- */
  const approveAll = async (batch) => {
    const comment = (comments[batch._id] || '').trim()
      || 'Bulk approval — required information and supporting documents verified by the College Office.';
    setErr(''); setSuccess(''); setBusy(`all:${batch._id}`);
    try {
      const res = await api.post(`/college/batches/${batch._id}/approve-all`, { comment });
      const data = res.data || {};
      const skipped = Array.isArray(data.skipped) ? data.skipped : [];
      const skippedLines = skipped.map(s =>
        `• ${s.fullName}: ${(s.missingInfo || []).join(', ') || 'incomplete information'}`);
      setSuccess([
        data.message || 'Bulk approval completed.',
        ...(skippedLines.length ? ['Skipped students (notified automatically):', ...skippedLines] : []),
      ].join('\n'));
      setComments(prev => ({ ...prev, [batch._id]: '' }));
      load();
    } catch (e) {
      setErr(e.response?.data?.message || 'Could not approve the students in bulk.');
    } finally {
      setBusy('');
    }
  };

  /* ---- function 6: the single forward action -------------------------- */
  const forwardApproved = async (batchId) => {
    const comment = (comments[batchId] || '').trim();
    const b = batches.find(x => x._id === batchId);
    const approvedCount = studentsOf(b).filter(r => r.status === 'college_approved').length;
    setSuccess('');
    if (approvedCount === 0) {
      setErr('No students approved yet — approve students before forwarding.');
      return;
    }
    setErr(''); setBusy(`fw:${batchId}`);
    try {
      const res = await api.post(`/college/batches/${batchId}/forward-approved`, { comment });
      setSuccess(res.data?.message || 'Approved students forwarded to the Academic VP.');
      setComments(prev => ({ ...prev, [batchId]: '' }));
      load();
    } catch (e) {
      setErr(e.response?.data?.message || 'Could not forward the approved students.');
    } finally {
      setBusy('');
    }
  };

  return (
    <CollegePortal>
      <h1>Review &amp; Approve</h1>
      <p className="muted">
        Check that each student's request is complete (return form + completion
        letter), approve or reject them one by one — or use “Approve all
        remaining” to approve every complete student at once — then forward the
        approved students to the Academic VP with a single action. Students with
        missing information are never approved in bulk: they are skipped and
        notified automatically.
      </p>

      {err && <p className="error" style={{ whiteSpace: 'pre-line' }}>{err}</p>}
      {success && <p className="notice-ok" style={{ whiteSpace: 'pre-line' }}>✅ {success}</p>}
      {loading && <p className="muted">Loading…</p>}

      {!loading && batches.length === 0 && (
        <p className="muted">
          No requests waiting for the College Office. Batches forwarded by the CS
          Department appear here automatically.{' '}
          <Link to="/college/history">View previous requests →</Link>
        </p>
      )}

      {batches.map(b => {
        const decisions = studentsOf(b);
        const approvedCount = decisions.filter(r => r.status === 'college_approved').length;
        const rejectedCount = decisions.filter(r => r.status === 'rejected').length;
        const undecided     = decisions.filter(r => r.status === 'pending_college').length;

        return (
          <div key={b._id} className="batch-card">
            <div className="batch-head">
              <h3>{b.batchName}</h3>
              <StatusBadge status={b.status} />
              <span className="muted">{b.semester} · {b.academicYear}</span>
            </div>

            {b.forwardedBy && (
              <div className="forwarded-info">
                <span>
                  <b>Received from:</b> {b.forwardedBy.name} ({b.forwardedBy.role})
                </span>
                {b.forwardedBy.at && (
                  <span className="fw-when">{new Date(b.forwardedBy.at).toLocaleString()}</span>
                )}
                {b.forwardedBy.comment && (
                  <span className="fw-when">note: “{b.forwardedBy.comment}”</span>
                )}
              </div>
            )}

            {/* Returned by the Academic VP / Admin VP — what must be corrected */}
            {b.rejectionReason && (
              <div className="forwarded-info">
                <span><b>↩ Returned for correction:</b> {b.rejectionReason}</span>
              </div>
            )}

            <p>
              <span className="chip ok">approved {approvedCount}</span>{' '}
              <span className="chip bad">rejected {rejectedCount}</span>{' '}
              <span className="chip">not decided {undecided}</span>{' '}
              <Link className="muted" to="/college/documents">documents &amp; letters →</Link>
            </p>

            {/* ---- functions 3 + 4 + 5: review one student at a time ---- */}
            <ul className="student-review-list">
              {decisions.map(r => {
                const missing = Array.isArray(r.missingInfo) ? r.missingInfo : [];
                const canAct = r.status === 'pending_college' && r.student?._id;
                const blocked = canAct && missing.length > 0;
                return (
                  <li key={r.student?._id || r._id} className="student-review-item">
                    <span className="student-name">{r.student?.fullName}</span>
                    <small className="muted">{r.student?.institutionalId}</small>
                    <small className="muted">
                      {r.student?.program || '—'} · {r.student?.year ? `Year ${r.student.year}` : '—'} ·
                      📞 {r.student?.phone || '—'} · ✉️ {r.student?.email || '—'}
                    </small>
                    {r.amount != null && <span className="chip">{(Number(r.amount) || 0).toLocaleString()} ETB</span>}
                    <PaymentRequestStatus status={r.status} />

                    {missing.length > 0 && (
                      <div style={{ width: '100%', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '8px', padding: '0.45rem 0.6rem' }}>
                        <div style={{ fontWeight: 700, color: '#9a3412', fontSize: '0.82rem' }}>Missing information — cannot approve until corrected</div>
                        <div style={{ color: '#9a3412', fontSize: '0.8rem' }}>{missing.join(', ')}</div>
                        {r.missingInfoRequestedAt && <div style={{ color: '#b45309', fontSize: '0.75rem', marginTop: '0.2rem' }}>Notified: {new Date(r.missingInfoRequestedAt).toLocaleString()}</div>}
                      </div>
                    )}

                    {r.status === 'college_approved' && r.collegeApprovalComment && (
                      <small className="muted">✔ {r.collegeApprovalComment}</small>
                    )}
                    {r.rejectionReason && (
                      <small className="muted">
                        {r.status === 'rejected' ? '✘ ' : '↩ returned — correct and approve again: '}
                        {r.rejectionReason}
                      </small>
                    )}

                    <span className="student-actions">
                      {blocked && (
                        <button
                          className="btn secondary"
                          disabled={busy === `${b._id}:${r.student?._id}:info` || !r.student?._id}
                          onClick={() => requestMissingInfo(b._id, r.student?._id)}
                        >
                          {busy === `${b._id}:${r.student?._id}:info`
                            ? 'Notifying…'
                            : r.missingInfoRequestedAt
                              ? 'Send another reminder'
                              : 'Notify student to fill missing info'}
                        </button>
                      )}
                      <button
                        className="btn primary"
                        disabled={busy === `${b._id}:${r.student?._id}` ||
                                  !r.student?._id ||
                                  r.status !== 'pending_college' ||
                                  blocked}
                        title={blocked ? 'Fix missing information first (or notify the student)' : 'Approve student'}
                        onClick={() => decideStudent(b._id, r.student?._id, 'approve')}
                      >
                        Approve
                      </button>
                      <button
                        className="btn danger"
                        disabled={busy === `${b._id}:${r.student?._id}` ||
                                  !r.student?._id ||
                                  r.status !== 'pending_college'}
                        onClick={() => decideStudent(b._id, r.student?._id, 'reject')}
                      >
                        Reject
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>

            {/* ---- function 5: the comment that accompanies the decisions ---- */}
            <textarea
              className="comment"
              placeholder="Review comment / rejection reason — MANDATORY for rejection and recommended for approval. Written on decisions and on forward."
              value={comments[b._id] || ''}
              onChange={setComment(b._id)}
            />

            {/* ---- function 6: one forward for the whole batch ---- */}
            <div className="batch-actions">
              <button
                className="btn secondary"
                disabled={busy === `cs:${b._id}`}
                title="Send a threaded message to the CS Department asking them to correct or verify the student information in this batch"
                onClick={() => requestCsCorrection(b)}
              >
                {busy === `cs:${b._id}`
                  ? 'Sending…'
                  : 'Message CS Department to correct all students'}
              </button>
              <button
                className="btn secondary"
                disabled={busy === `all:${b._id}` || undecided === 0}
                title={undecided === 0
                  ? 'Every student already has a decision'
                  : 'Approve every student whose information is complete; incomplete students are skipped and notified'}
                onClick={() => approveAll(b)}
              >
                {busy === `all:${b._id}`
                  ? 'Approving…'
                  : `Approve all remaining (${undecided})`}
              </button>
              <button
                className="btn primary"
                disabled={busy === `fw:${b._id}`}
                onClick={() => forwardApproved(b._id)}
              >
                {busy === `fw:${b._id}`
                  ? 'Forwarding…'
                  : `Forward ${approvedCount} approved student(s) to Academic VP`}
              </button>
            </div>
          </div>
        );
      })}
    </CollegePortal>
  );
}
