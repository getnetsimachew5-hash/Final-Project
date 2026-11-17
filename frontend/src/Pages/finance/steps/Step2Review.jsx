import StatusBadge from '../../../components/StatusBadge';
import {
  batchTotal,
  money,
  requestsOf,
  shortDate,
  studentPhone,
} from './helpers';

// FUNCTION 2 — Review & confirm payment information.
// The officer checks the Admin VP authorization and every student's
// phone/amount/organization before payment.
export default function Step2Review({ batch, confirmed, onConfirmed }) {
  const requests = requestsOf(batch);
  const missingPhone = requests.filter((request) => !studentPhone(request));
  const total = batch.authorizedAmount || batchTotal(batch);

  return (
    <>
      <div className="vp-panel-head">
        <h2>2. Review &amp; confirm payment information</h2>
        <p className="muted">
          Batch <b>{batch.batchName}</b> · {batch.semester} {batch.academicYear} ·{' '}
          <StatusBadge status={batch.status} />
        </p>
      </div>

      {batch.financeReviewConfirmedAt && (
        <p className="vp-status-note">
          Payment information was already confirmed on {new Date(batch.financeReviewConfirmedAt).toLocaleString()}.
        </p>
      )}

      <div className="vp-summary-grid">
        <div className="vp-summary"><span>Students</span><b>{requests.length}</b></div>
        <div className="vp-summary"><span>Authorized</span><b>{money(total)} ETB</b></div>
        <div className="vp-summary">
          <span>Admin VP reference</span>
          <b>{batch.paymentReference || '—'}</b>
        </div>
        <div className="vp-summary">
          <span>Admin VP decision</span>
          <b>{batch.adminVpDecision ? batch.adminVpDecision.toUpperCase() : '—'}</b>
        </div>
      </div>

      <div className="vp-handoff-card">
        <div>
          <span className="vp-handoff-actor">Administrative VP</span>
          <small className="muted">
            {batch.adminVpForwardedAt
              ? `Authorized ${shortDate(batch.adminVpForwardedAt)}`
              : 'Authorized and forwarded'}
          </small>
        </div>
        <span className="vp-handoff-arrow" aria-hidden="true">→</span>
        <div>
          <span className="vp-handoff-actor">Finance Office</span>
          <small className="muted">Review and confirm the payment information</small>
        </div>
      </div>

      {batch.adminVpComment && (
        <div className="vp-quote">
          <small className="muted">Authorization note</small>
          <p>Admin VP: “{batch.adminVpComment}”</p>
        </div>
      )}

      {missingPhone.length > 0 && (
        <p className="error">
          {missingPhone.length} student(s) do not have a phone number for TeleBirr:
          {' '}{missingPhone.map((request) => request.student?.fullName || 'Unknown').join(', ')}.
          A batch payment will skip them and report the reason; pay them individually
          after the phone is corrected.
        </p>
      )}

      <div className="vp-table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Program</th>
              <th>Year</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Organization</th>
              <th>Internship period</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request._id}>
                <td>
                  {request.student?.fullName || 'Unknown student'}<br />
                  <small className="muted">{request.student?.institutionalId || '—'}</small>
                </td>
                <td>{request.student?.program || '—'}</td>
                <td>{request.student?.year ? `Year ${request.student.year}` : '—'}</td>
                <td>{studentPhone(request) || <span className="muted">Missing</span>}</td>
                <td>{request.student?.email || '—'}</td>
                <td>{request.return?.orgName || '—'}</td>
                <td>
                  {shortDate(request.return?.startDate)} → {shortDate(request.return?.endDate)}
                </td>
                <td><b>{money(request.amount)} ETB</b></td>
                <td><StatusBadge status={request.status} /></td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr><td colSpan="9" className="muted">No student requests in this batch.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <label className="vp-ack">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => onConfirmed(event.target.checked)}
        />
        <span>
          I have reviewed the payment information for this batch and confirm that the student
          phones, amounts, organization, and authorization reference are correct.
        </span>
      </label>

      {missingPhone.length > 0 && (
        <p className="muted">
          Students without a phone are skipped during a batch payment and remain
          pending so Finance can pay them after the student record is corrected.
        </p>
      )}
    </>
  );
}
