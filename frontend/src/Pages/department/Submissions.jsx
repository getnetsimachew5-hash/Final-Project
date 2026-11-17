import { useEffect, useState } from 'react';
import api, { fileUrl } from '../../api/axios';
import DepartmentPortal from './DepartmentPortal';
import StatusBadge from '../../components/StatusBadge';

export default function Submissions() {
  const [data, setData] = useState({ returns: [], letters: [] });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = () =>
    api.get('/department/submissions')
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.message || 'Failed to load submissions'));

  useEffect(() => { load(); }, []);

  // Letter.return is an ObjectId, so compare as strings.
  const letterFor = id => data.letters.find(l => String(l.return) === String(id));

  // A student can only be batched once CS has verified the submission and the
  // automatic completeness check reports nothing missing (phone, program,
  // year, organization, supervisor, dates, completion letter, …). Students who
  // are already paid or already in another batch are not "ready" again.
  const readyForBatch = r => Boolean(
    r.verified &&
    !(r.missingInfo || []).length &&
    !r.alreadyBatched &&
    !(r.paymentReopenAllowed && !r.paymentReopenRequestedAt)
  );

  // Paid / Pending / Not-batched separation for the department head.
  const paidCount = data.returns.filter(r => r.paymentStatus === 'paid').length;
  const pendingCount = data.returns.filter(r => r.paymentStatus === 'pending').length;
  const notBatchedCount = data.returns.filter(
    r => r.paymentStatus !== 'paid' && r.paymentStatus !== 'pending'
  ).length;

  const filteredReturns = data.returns.filter((r) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'paid') return r.paymentStatus === 'paid';
    if (statusFilter === 'pending') return r.paymentStatus === 'pending';
    return r.paymentStatus !== 'paid' && r.paymentStatus !== 'pending';
  });

  // CS Dept sends a message to the student to fill the correct information.
  const askToCorrect = async (r) => {
    const reason = window.prompt(
      `Message to ${r.student?.fullName} — what information is missing or wrong? ` +
      'The student will see this message and resubmit correct information.'
    );
    if (reason === null) return;
    if (!reason.trim()) { setMsg(''); setError('A correction message is required.'); return; }
    try {
      await api.post(`/department/returns/${r._id}/reject`, { reason });
      setMsg(`📨 Message sent to ${r.student?.fullName}. They must fill the correct information and resubmit.`);
      setError('');
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to send message');
    }
  };

  // Send a plain message/notification WITHOUT rejecting the submission.
  const sendMessage = async (r) => {
    const context = [
      `Student: ${r.student?.fullName || 'Unknown'} (${r.student?.institutionalId || 'no ID'})`,
      `Phone: ${r.student?.phone || 'missing'}`,
      `Program: ${r.student?.program || 'missing'}`,
      `Organization: ${r.orgName || 'missing'}`,
    ].join('\n');
    const text = window.prompt(
      `Send a verification message to ${r.student?.fullName}.\n\n` +
      `Student information attached automatically:\n${context}\n\n` +
      'Write your message:'
    );
    if (text === null) return;
    if (!text.trim()) { setMsg(''); setError('A message is required.'); return; }
    try {
      const res = await api.post(`/department/returns/${r._id}/message`, { message: text });
      setMsg(`📨 ${res.data?.message || 'Message sent.'}`);
      setError('');
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to send message');
    }
  };

  // Open one controlled post-paid update window. The student can then correct
  // their information and be placed in a replacement payment batch.
  const grantAnotherPayment = async (r) => {
    const reason = window.prompt(
      `Allow ${r.student?.fullName} to update their information after payment?\n\n` +
      'This releases the old paid request from the "one student, one payment" guard. ' +
      'Explain the reason (the student will see it):'
    );
    if (reason === null) return;
    if (!reason.trim()) { setMsg(''); setError('A reason is required.'); return; }
    try {
      const res = await api.post(`/department/students/${r.student?._id}/reopen-payment`, { reason });
      setMsg(`🔓 ${res.data?.message || 'Update permission granted.'}`);
      setError('');
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to grant another payment');
    }
  };

  return (
    <DepartmentPortal>
      <h1>Student Information</h1>
      <p>
        Complete record for every student: name, email, registered TeleBirr phone,
        program, year of study and username. Passwords stay private. The system
        checks every record automatically — the <b>Missing Information</b> column
        lists exactly what the student must correct. After a student submits the
        return form and completion letter you can verify them, or send a message
        to correct incomplete information.
      </p>

      {msg && <p className="success">{msg}</p>}
      {error && <p className="error">{error}</p>}
      {data.returns.length > 0 && (
        <div className="batch-tools">
          <label htmlFor="payment-status-filter" className="muted">Payment status:</label>
          <select
            id="payment-status-filter"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">All students ({data.returns.length})</option>
            <option value="not_batched">Not batched yet ({notBatchedCount})</option>
            <option value="pending">Pending payment ({pendingCount})</option>
            <option value="paid">Already paid ({paidCount})</option>
          </select>
          <span className="muted">Showing {filteredReturns.length} student(s)</span>
        </div>
      )}

      {data.returns.length === 0 && <p className="empty">No submissions yet — waiting for students to submit their return forms.</p>}
      {data.returns.length > 0 && filteredReturns.length === 0 && (
        <p className="empty">No students match this payment-status filter.</p>
      )}

      {data.returns.some(r => (r.missingInfo || []).length > 0) && (
        <p className="warn-banner">
          ⚠️ {data.returns.filter(r => (r.missingInfo || []).length > 0).length} record(s)
          are incomplete. They cannot be verified or added to a payment batch until the
          student fixes the listed items.
        </p>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>Name</th><th>Univ. ID</th><th>TeleBirr Phone</th><th>Program</th><th>Year of Study</th>
            <th>Missing Information</th>
            <th>Username</th><th>Letter</th>
            <th>Payment Status</th>
            <th>Verified</th><th>Status</th><th>Action</th>
          </tr>
        </thead>
        <tbody>
          {filteredReturns.map(r => (
            <tr key={r._id} className={(r.missingInfo || []).length ? 'needs-fix' : ''}>
              <td className="cell-name">
                {r.student?.fullName}
                {r.student?.email && <><br /><small className="muted">{r.student.email}</small></>}
              </td>
              <td className="cell-id">{r.student?.institutionalId}</td>
              <td>{r.student?.phone || <span className="muted">missing</span>}</td>
              <td>{r.student?.program || <span className="muted">missing</span>}</td>
              <td>
                {r.student?.year
                  ? `Year ${r.student.year}`
                  : (r.student?.semester || <span className="muted">missing</span>)}
              </td>
              <td className="cell-missing">
                {(r.missingInfo || []).length > 0 ? (
                  <ul className="missing-list">
                    {r.missingInfo.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                ) : (
                  <span className="ok-chip">✅ Complete</span>
                )}
              </td>
              <td><span className="cred">{r.student?.username || '—'}</span></td>
              <td>
                {letterFor(r._id)
                  ? <a className="file-link" href={fileUrl(letterFor(r._id).filePath)} target="_blank" rel="noreferrer">📄 View</a>
                  : <span className="muted">Missing</span>}
              </td>
              <td>
                {r.paymentStatus === 'paid' ? (
                  <>
                    <span className="ok-chip">💰 Paid</span>
                    {r.paymentReopenAllowed && (
                      <><br /><span className="ok-chip">🔓 Update window open</span></>
                    )}
                  </>
                ) : r.paymentReopenAllowed ? (
                  <>
                    <span className="ok-chip">🔓 Update window open</span>
                    <br />
                    <small className="muted">
                      {r.paymentReopenRequestedAt ? 'Corrected — verify again' : 'Waiting for student to resubmit'}
                    </small>
                  </>
                ) : r.paymentStatus === 'pending' ? (
                  <>
                    <StatusBadge status={r.batchInfo?.status || 'pending_department'} />
                    {r.batchInfo?.requestStatus === 'rejected' && (
                      <><br /><StatusBadge status="rejected" /></>
                    )}
                    {r.batchInfo?.batchName && (
                      <>
                        <br />
                        <small className="muted">{r.batchInfo.batchName}</small>
                      </>
                    )}
                  </>
                ) : (
                  <span className="muted">Not batched</span>
                )}
              </td>
              <td>{r.verified ? '✅ Verified' : '⏳ Pending'}</td>
              <td>
                <StatusBadge status={r.status} />
                {r.status === 'rejected' && (
                  <small className="reject-reason">
                    Sent: {r.rejectionReason}
                  </small>
                )}
              </td>
              <td>
                <div className="row-actions">
                  <button
                    className="btn small"
                    onClick={() => askToCorrect(r)}
                    title="Reject the submission and ask the student to correct it"
                  >
                    ✉️ Ask to Correct
                  </button>
                  <button
                    className="btn small secondary"
                    onClick={() => sendMessage(r)}
                    title="Send a message with this student's information attached"
                  >
                    💬 Verify / Message
                  </button>
                  {r.paymentStatus === 'paid' && !r.paymentReopenAllowed && (
                    <button
                      className="btn small"
                      onClick={() => grantAnotherPayment(r)}
                      title="Allow this paid student to correct information and request another payment"
                    >
                      🔓 Allow Another Payment
                    </button>
                  )}
                  {r.paymentReopenAllowed && (
                    <span className="ok-chip">
                      {r.paymentReopenRequestedAt ? '🔓 Permission active' : '🔓 Waiting for resubmission'}
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary: complete vs. incomplete students */}
      <div className="cards">
        <div className="card"><h3>Students Shown</h3><p>{filteredReturns.length}</p></div>
        <div className="card">
          <h3>Records with Missing Information</h3>
          <p>{data.returns.filter(r => (r.missingInfo || []).length > 0).length}</p>
        </div>
        <div className="card">
          <h3>Verified &amp; Ready for Batch</h3>
          <p>{data.returns.filter(readyForBatch).length}</p>
        </div>
        <div className="card"><h3>Pending Payment</h3><p>{pendingCount}</p></div>
        <div className="card"><h3>Already Paid</h3><p>{paidCount}</p></div>
      </div>
    </DepartmentPortal>
  );
}