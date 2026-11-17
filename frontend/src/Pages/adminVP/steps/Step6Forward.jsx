const money = (n) => (Number(n) || 0).toLocaleString();

// FUNCTION 6 — Forward the approved request directly to Finance.
// For an approval this calls POST /admin-vp/batches/:id/forward (from the
// dashboard footer). A rejection has no forwarding step: it goes back to the
// Academic VP for correction.
export default function Step6Forward({ batch, decision, busy }) {
  const forwarded =
    Boolean(batch.adminVpForwardedAt) ||
    ['pending_finance', 'paid'].includes(batch.status);

  if (decision === 'reject' || batch.adminVpDecision === 'rejected') {
    return (
      <>
        <div className="vp-panel-head">
          <h2>6. Request returned for correction</h2>
          <p className="muted">
            Nothing is forwarded to Finance for a rejected request.
          </p>
        </div>

        <div className="vp-outcome reject">
          <h3>↩ Returned to the Academic VP Office</h3>
          <p>
            Batch <b>{batch.batchName}</b> was rejected and returned for correction. The
            Academic VP will see your comment and can endorse it again after fixing the
            problem.
          </p>
          <p className="muted">Continue to step 7 to see the full approval trail.</p>
        </div>
      </>
    );
  }

  if (forwarded) {
    return (
      <>
        <div className="vp-panel-head">
          <h2>6. Forwarded to Finance</h2>
          <p className="muted">The hand-off to the next actor is complete.</p>
        </div>

        <div className="vp-outcome approve">
          <h3>✅ Forwarded to the Finance Office</h3>
          <p>
            Batch <b>{batch.batchName}</b> ({money(batch.authorizedAmount || batch.totalAmount)} ETB)
            is now in <b>Finance Payment Processing</b>. The Finance Office has been notified
            and can review the payment information and process the TeleBirr payments.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="vp-panel-head">
        <h2>6. Forward approved request to Finance</h2>
        <p className="muted">
          The decision is saved. Sending it to the next actor is the final action.
        </p>
      </div>

      <div className="vp-summary-grid">
        <div className="vp-summary">
          <span>Batch</span>
          <b>{batch.batchName}</b>
        </div>
        <div className="vp-summary">
          <span>Authorized</span>
          <b>{money(batch.authorizedAmount || batch.totalAmount)} ETB</b>
        </div>
        <div className="vp-summary">
          <span>Students</span>
          <b>{batch.studentCount ?? (batch.students || []).length}</b>
        </div>
      </div>

      <div className="vp-handoff-card">
        <div>
          <span className="vp-handoff-actor">Administrative VP</span>
          <small className="muted">Authorization complete</small>
        </div>
        <span className="vp-handoff-arrow" aria-hidden="true">→</span>
        <div>
          <span className="vp-handoff-actor">Finance Office</span>
          <small className="muted">Next task: review payment information &amp; pay</small>
        </div>
      </div>

      <p className="muted">
        {busy
          ? 'Forwarding the batch and notifying the Finance Office…'
          : 'Press “Forward to Finance” below to notify the next office and move the batch forward.'}
      </p>
    </>
  );
}
