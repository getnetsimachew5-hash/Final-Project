const money = (n) => (Number(n) || 0).toLocaleString();

// FUNCTION 3 — Confirm payment availability/authorization.
// The values are persisted by POST /admin-vp/batches/:id/confirm-payment when
// the user continues to the decision step.
export default function Step3Payment({ batch, amount, reference, confirmed, onAmount, onReference, onConfirmed }) {
  const total = Number(batch.totalAmount) || 0;
  const entered = Number(amount) || 0;
  const delta = entered - total;

  return (
    <>
      <div className="vp-panel-head">
        <h2>3. Confirm payment availability / authorization</h2>
        <p className="muted">
          Confirm that the budget for <b>{batch.batchName}</b> is available and that the
          Administrative VP authorizes it. This is recorded in the batch history.
        </p>
      </div>

      <div className="vp-summary-grid">
        <div className="vp-summary">
          <span>Requested total</span>
          <b>{money(total)} ETB</b>
        </div>
        <div className="vp-summary">
          <span>Students</span>
          <b>{batch.studentCount ?? (batch.students || []).length}</b>
        </div>
        <div className="vp-summary">
          <span>Payment status</span>
          <b>{batch.paymentConfirmedAt ? 'Confirmed' : 'Not confirmed'}</b>
        </div>
      </div>

      <div className="vp-form-row">
        <label className="vp-field">
          <span>Authorized amount (ETB) *</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => onAmount(e.target.value)}
            placeholder="0.00"
          />
        </label>

        <label className="vp-field">
          <span>Payment / budget reference (optional)</span>
          <input
            type="text"
            value={reference}
            onChange={(e) => onReference(e.target.value)}
            placeholder="e.g. budget line, voucher or approval reference"
            maxLength="120"
          />
        </label>
      </div>

      {entered > 0 && Math.abs(delta) > 0.009 && (
        <p className={delta < 0 ? 'error' : 'muted'}>
          {delta < 0
            ? `The authorized amount is ${money(Math.abs(delta))} ETB below the requested total.`
            : `The authorized amount is ${money(delta)} ETB above the requested total.`}
        </p>
      )}

      <label className="vp-ack">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => onConfirmed(e.target.checked)}
        />
        <span>
          I confirm that <b>{money(entered)} ETB</b> is available and authorized for this
          batch, and I take responsibility for this confirmation.
        </span>
      </label>

      <p className="muted">
        Next: record the approval/rejection decision, add a comment, then forward the
        approved request directly to Finance.
      </p>
    </>
  );
}
