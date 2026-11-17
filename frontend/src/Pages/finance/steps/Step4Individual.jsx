import { money, pendingRequestsOf, studentPhone } from './helpers';

// FUNCTION 4 — Process individual payment.
// The officer chooses to pay one student through TeleBirr, or switches to the
// batch-payment path in step 5.
export default function Step4Individual({
  batch,
  mode,
  selectedRequestId,
  onMode,
  onSelectRequest,
}) {
  const requests = pendingRequestsOf(batch);
  const selected = requests.find((request) => String(request._id) === String(selectedRequestId));

  const chooseIndividual = (requestId) => {
    onMode('individual');
    onSelectRequest(requestId);
  };

  return (
    <>
      <div className="vp-panel-head">
        <h2>4. Process individual payment</h2>
        <p className="muted">
          Choose whether Finance should pay <b>one student</b> now or pay the whole
          batch together. The next function shows the batch option.
        </p>
      </div>

      {batch.financePaymentMode && batch.financePaymentMode === mode && (
        <p className="vp-status-note">
          A payment method was already selected: <b>
            {batch.financePaymentMode === 'individual' ? 'Individual payment' : 'Batch payment'}
          </b>.
        </p>
      )}

      <div className="vp-decision-grid">
        <button
          type="button"
          className={`vp-decision approve${mode === 'individual' ? ' selected' : ''}`}
          onClick={() => {
            if (!selectedRequestId && requests.length > 0) chooseIndividual(requests[0]._id);
            else onMode('individual');
          }}
        >
          <span className="vp-decision-icon" aria-hidden="true">1</span>
          <b>Individual TeleBirr payment</b>
          <small>Pay one selected student, then return for the next student if needed.</small>
        </button>

        <button
          type="button"
          className={`vp-decision ${mode === 'batch' ? 'selected' : ''}`}
          onClick={() => onMode('batch')}
        >
          <span className="vp-decision-icon" aria-hidden="true">∞</span>
          <b>Batch TeleBirr payment</b>
          <small>Pay every pending student in this batch in one controlled batch.</small>
        </button>
      </div>

      {mode === 'individual' && (
        <>
          <h3>Select the student to pay</h3>
          {requests.length === 0 && <p className="muted">No pending students in this batch.</p>}

          <div className="vp-batch-grid">
            {requests.map((request) => {
              const active = String(request._id) === String(selectedRequestId);
              return (
                <article key={request._id} className={`vp-batch-select${active ? ' selected' : ''}`}>
                  <h3>{request.student?.fullName || 'Unknown student'}</h3>
                  <p className="muted vp-batch-meta">
                    {request.student?.program || '—'} ·{' '}
                    {request.student?.year ? `Year ${request.student.year}` : '—'} ·{' '}
                    {request.student?.institutionalId || '—'} · {studentPhone(request) || 'No phone'}
                  </p>
                  <p className="muted vp-batch-meta">✉️ {request.student?.email || '—'}</p>
                  <p className="muted vp-batch-meta">{request.return?.orgName || 'No organization'}</p>
                  <p className="vp-batch-amount">{money(request.amount)} ETB</p>
                  <button
                    type="button"
                    className={`btn ${active ? 'secondary' : 'primary'}`}
                    onClick={() => chooseIndividual(request._id)}
                  >
                    {active ? 'Selected ✓' : 'Pay this student'}
                  </button>
                </article>
              );
            })}
          </div>

          {selected && (
            <div className="vp-status-note">
              Individual scope: <b>{selected.student?.fullName}</b> — {money(selected.amount)} ETB
              to {studentPhone(selected) || 'a missing phone'}.
            </div>
          )}
        </>
      )}

      {mode === 'batch' && (
        <p className="vp-status-note">
          Batch mode selected. Continue to step 5 to confirm the full student scope.
        </p>
      )}

      {!mode && (
        <p className="muted">
          Select an individual student or choose batch payment to continue.
        </p>
      )}
    </>
  );
}
