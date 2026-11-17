import { money, paymentModeLabel } from './helpers';

// FUNCTION 7 — Generate payment reference.
// Each student transaction already has a TeleBirr reference. This step records
// the Finance Office settlement reference used by reports and history.
export default function Step7Reference({ batch, session }) {
  const transactions = session?.transactions || [];

  return (
    <>
      <div className="vp-panel-head">
        <h2>7. Generate payment reference</h2>
        <p className="muted">
          One settlement reference is recorded for the Finance Office, alongside the
          unique TeleBirr reference generated for every student.
        </p>
      </div>

      <div className="vp-summary-grid">
        <div className="vp-summary">
          <span>Settlement reference</span>
          <b>{batch.financeReference || 'Not generated yet'}</b>
        </div>
        <div className="vp-summary">
          <span>Mode</span>
          <b>{paymentModeLabel(batch.financePaymentMode)}</b>
        </div>
        <div className="vp-summary">
          <span>Students</span>
          <b>{transactions.length}</b>
        </div>
        <div className="vp-summary">
          <span>Amount</span>
          <b>{money(batch.financeConfirmedAmount)} ETB</b>
        </div>
      </div>

      {!batch.financeReference && (
        <p className="vp-status-note">
          Press <b>Generate reference &amp; continue</b> to record the settlement reference.
          The per-student references already exist from the simulation.
        </p>
      )}

      <div className="vp-table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Student</th><th>Program</th><th>Year</th><th>Phone</th>
              <th>Email</th><th>Amount</th><th>TeleBirr reference</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={transaction.transactionId}>
                <td>{transaction.studentName}</td>
                <td>{transaction.program || '—'}</td>
                <td>{transaction.year ? `Year ${transaction.year}` : '—'}</td>
                <td>{transaction.phone}</td>
                <td>{transaction.email || '—'}</td>
                <td>{money(transaction.amount)} ETB</td>
                <td><b>{transaction.reference}</b></td>
                <td>{transaction.status}</td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr><td colSpan="8" className="muted">No simulated transactions found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="muted">
        Next: confirm each OTP to complete the TeleBirr payment and notify the student.
      </p>
    </>
  );
}
