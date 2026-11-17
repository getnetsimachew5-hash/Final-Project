import { money } from './helpers';

// FUNCTION 8 — Confirm successful payment.
// The simulated OTPs are shown in the academic demo. The officer reviews them
// and the dashboard calls POST /finance/batches/:id/confirm.
export default function Step8Confirm({ batch, session, otpByTransaction, onOtpChange }) {
  const transactions = session?.transactions || [];
  const awaiting = transactions.filter((transaction) => transaction.status === 'otp_sent');
  const confirmed = transactions.filter((transaction) => transaction.status === 'confirmed');

  return (
    <>
      <div className="vp-panel-head">
        <h2>8. Confirm successful payment</h2>
        <p className="muted">
          Enter or keep the simulated OTP for each student. Confirming completes the
          TeleBirr transaction and sends the student their payment notification.
        </p>
      </div>

      <div className="vp-summary-grid">
        <div className="vp-summary"><span>Transactions</span><b>{transactions.length}</b></div>
        <div className="vp-summary"><span>Awaiting OTP</span><b>{awaiting.length}</b></div>
        <div className="vp-summary"><span>Already confirmed</span><b>{confirmed.length}</b></div>
        <div className="vp-summary">
          <span>Settlement ref</span>
          <b>{batch.financeReference || '—'}</b>
        </div>
      </div>

      <div className="vp-table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Student</th><th>Program</th><th>Year</th><th>Phone</th><th>Email</th>
              <th>Amount</th><th>Reference</th><th>OTP</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => {
              const value = otpByTransaction?.[transaction.transactionId]
                ?? transaction.otp
                ?? '';
              return (
                <tr key={transaction.transactionId}>
                  <td>{transaction.studentName}</td>
                  <td>{transaction.program || '—'}</td>
                  <td>{transaction.year ? `Year ${transaction.year}` : '—'}</td>
                  <td>{transaction.phone}</td>
                  <td>{transaction.email || '—'}</td>
                  <td>{money(transaction.amount)} ETB</td>
                  <td>{transaction.reference}</td>
                  <td>
                    {transaction.status === 'confirmed' ? (
                      <span className="muted">Confirmed</span>
                    ) : (
                      <input
                        aria-label={`OTP for ${transaction.studentName}`}
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="6-digit OTP"
                        value={value}
                        onChange={(event) =>
                          onOtpChange(
                            transaction.transactionId,
                            event.target.value.replace(/\D/g, '')
                          )
                        }
                        style={{ maxWidth: '9rem' }}
                      />
                    )}
                  </td>
                  <td>
                    <span className={`badge ${transaction.status === 'confirmed' ? 'green' : 'yellow'}`}>
                      {transaction.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="muted">
        {awaiting.length > 0
          ? `${awaiting.length} student payment(s) will be confirmed.`
          : 'All transactions are already confirmed. Continue to set the batch status to PAID.'}
      </p>
      <p className="muted">
        The OTPs are shown only because this is a TeleBirr simulation. In production they
        are sent to the student's phone and never displayed here.
      </p>
    </>
  );
}
