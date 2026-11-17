import {
  findRequest,
  money,
  pendingRequestsOf,
  requestTotal,
  studentPhone,
} from './helpers';

// FUNCTION 5 — Process batch payment.
// Pay every pending student in the batch together. When the officer chose the
// individual path in step 4 this page confirms the single-student scope instead.
export default function Step5Batch({
  batch,
  mode,
  selectedRequestId,
  onMode,
  onSelectRequest,
}) {
  const requests = pendingRequestsOf(batch);
  const selected = findRequest(requests, selectedRequestId);
  const scope = mode === 'individual' && selected ? [selected] : requests;
  const total = requestTotal(scope);

  const chooseIndividual = () => {
    onMode('individual');
    if (!selectedRequestId && requests.length > 0) {
      onSelectRequest?.(requests[0]._id);
    }
  };

  return (
    <>
      <div className="vp-panel-head">
        <h2>5. Process batch payment</h2>
        <p className="muted">
          Review the exact TeleBirr payment scope. All selected students will receive
          their own transaction, reference, and OTP in the next steps.
        </p>
      </div>

      {!mode && (
        <p className="error">Choose a payment method in step 4 before continuing.</p>
      )}

      {mode === 'individual' && (
        <div className="vp-decision-summary approve">
          <b>Individual payment selected</b>
          <span>
            The batch-payment function is not used for this run. Only the selected student
            will be simulated and confirmed.
          </span>
        </div>
      )}

      {mode === 'batch' && (
        <div className="vp-decision-summary approve">
          <b>Batch payment selected</b>
          <span>
            All {requests.length} pending student(s) will be paid in one TeleBirr batch.
          </span>
        </div>
      )}

      <div className="vp-summary-grid">
        <div className="vp-summary"><span>Students in scope</span><b>{scope.length}</b></div>
        <div className="vp-summary"><span>Total amount</span><b>{money(total)} ETB</b></div>
        <div className="vp-summary">
          <span>Mode</span>
          <b>{mode === 'individual' ? 'Individual' : mode === 'batch' ? 'Batch' : '—'}</b>
        </div>
        <div className="vp-summary">
          <span>Authorized</span>
          <b>{money(batch.authorizedAmount || total)} ETB</b>
        </div>
      </div>

      <div className="vp-table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Student</th><th>Program</th><th>Year</th><th>Phone</th>
              <th>Email</th><th>Organization</th><th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {scope.map((request) => (
              <tr key={request._id}>
                <td>
                  {request.student?.fullName || 'Unknown'}<br />
                  <small className="muted">{request.student?.institutionalId || '—'}</small>
                </td>
                <td>{request.student?.program || '—'}</td>
                <td>{request.student?.year ? `Year ${request.student.year}` : '—'}</td>
                <td>{studentPhone(request) || <span className="error">Missing</span>}</td>
                <td>{request.student?.email || '—'}</td>
                <td>{request.return?.orgName || '—'}</td>
                <td><b>{money(request.amount)} ETB</b></td>
              </tr>
            ))}
            {scope.length === 0 && (
              <tr><td colSpan="7" className="muted">No students in the payment scope.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="batch-actions">
        {mode !== 'individual' && (
          <button type="button" className="btn secondary" onClick={chooseIndividual}>
            Switch to individual payment
          </button>
        )}
        {mode !== 'batch' && (
          <button type="button" className="btn secondary" onClick={() => onMode('batch')}>
            Use batch payment instead
          </button>
        )}
      </div>

      <p className="muted">
        Next: simulate TeleBirr and generate one OTP per student. No money is moved yet.
      </p>
    </>
  );
}
