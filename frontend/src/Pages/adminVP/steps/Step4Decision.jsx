// FUNCTION 4 — Approve or reject the request.
// The choice is held locally; it is committed in step 5 together with the
// mandatory comment (POST .../approve or .../reject).
export default function Step4Decision({ decision, onDecision }) {
  return (
    <>
      <div className="vp-panel-head">
        <h2>4. Approve or reject the request</h2>
        <p className="muted">
          Choose the administrative decision. You will add a comment before it is submitted.
        </p>
      </div>

      <div className="vp-decision-grid" role="radiogroup" aria-label="Administrative decision">
        <button
          type="button"
          role="radio"
          aria-checked={decision === 'approve'}
          className={`vp-decision approve${decision === 'approve' ? ' selected' : ''}`}
          onClick={() => onDecision('approve')}
        >
          <span className="vp-decision-icon" aria-hidden="true">✓</span>
          <b>Approve</b>
          <small>
            Authorize the request. After your comment it moves to step 6, where it is
            forwarded directly to Finance for payment processing.
          </small>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={decision === 'reject'}
          className={`vp-decision reject${decision === 'reject' ? ' selected' : ''}`}
          onClick={() => onDecision('reject')}
        >
          <span className="vp-decision-icon" aria-hidden="true">✕</span>
          <b>Reject</b>
          <small>
            Return the request to the Academic VP for correction. Your comment explains
            what must be fixed before it can be endorsed again.
          </small>
        </button>
      </div>

      <p className="muted">
        The decision is not saved until you add the comment and confirm in the next step.
      </p>
    </>
  );
}
