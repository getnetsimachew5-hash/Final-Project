const ROLE_LABEL = {
  academic_vp: 'Academic VP Office',
  admin_vp: 'Administrative VP Office',
  college: 'College Office',
  cs_dept: 'CS Department',
  industrial: 'Former staff',
  finance: 'Finance Office',
};

// FUNCTION 5 — Add comments.
// The comment is mandatory for both decisions: it confirms the payment
// authorization (approve) or explains the correction needed (reject). It is
// submitted together with the decision chosen in step 4.
export default function Step5Comment({ batch, decision, comment, onComment }) {
  const endorsement = (batch.history || [])
    .filter((h) => h.action === 'endorsed')
    .slice(-1)[0];

  const approving = decision === 'approve';
  const c = comment.trim();

  return (
    <>
      <div className="vp-panel-head">
        <h2>5. Add comments</h2>
        <p className="muted">
          Your comment is saved in the batch history and sent to the next actor.
        </p>
      </div>

      <div className={`vp-decision-summary ${approving ? 'approve' : 'reject'}`}>
        <b>{approving ? 'Decision: Approve' : 'Decision: Reject'}</b>
        <span>
          {approving
            ? 'The request will be authorized and can then be forwarded directly to Finance.'
            : 'The request will be returned to the Academic VP for correction.'}
        </span>
      </div>

      {endorsement && (
        <div className="vp-quote">
          <small className="muted">
            Academic VP endorsement by {endorsement.actor?.fullName || 'Academic VP'} ·{' '}
            {ROLE_LABEL[endorsement.actor?.role] || 'Academic VP Office'}
          </small>
          <p>“{endorsement.comment}”</p>
        </div>
      )}

      <label className="vp-field">
        <span>
          {approving ? 'Authorization comment *' : 'Reason for rejection *'}
        </span>
        <textarea
          className="comment"
          rows="5"
          value={comment}
          onChange={(e) => onComment(e.target.value)}
          placeholder={
            approving
              ? 'Confirm that the payment availability/authorization was checked and mention any reference…'
              : 'Explain exactly what is wrong and what the Academic VP must correct…'
          }
        />
      </label>

      <p className={c.length > 0 && c.length < 5 ? 'error' : 'muted'}>
        {c.length}/5 characters minimum. {approving
          ? 'Comment is required to authorize the payment.'
          : 'Comment is required so the Academic VP knows what to fix.'}
      </p>

      <p className="muted">
        Press <b>{approving ? 'Approve & continue' : 'Reject & continue'}</b> to save
        the decision. Nothing is submitted until you do.
      </p>
    </>
  );
}
