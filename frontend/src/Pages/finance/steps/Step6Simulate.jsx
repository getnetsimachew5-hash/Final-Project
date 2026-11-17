import { dateTime, money, paymentModeLabel } from './helpers';

// FUNCTION 6 — Simulate TeleBirr payment.
// The dashboard calls POST /finance/batches/:id/simulate before showing this
// step. The server creates one transaction + OTP per student in the selected
// payment scope. This page displays the academic simulation clearly.
export default function Step6Simulate({ batch, session }) {
  const transactions = session?.transactions || [];

  return (
    <>
      <div className="vp-panel-head">
        <h2>6. Simulate TeleBirr payment</h2>
        <p className="muted">
          TeleBirr is simulated for the selected scope. Each student receives a phone
          transaction, an OTP, and a unique payment reference.
        </p>
      </div>

      {batch.financeSimulatedAt && (
        <p className="vp-status-note">
          Simulation created {dateTime(batch.financeSimulatedAt)} for{' '}
          <b>{paymentModeLabel(session?.mode || batch.financePaymentMode)}</b>.
        </p>
      )}

      {transactions.length === 0 && (
        <p className="muted">
          No TeleBirr transactions are loaded yet. Return to step 5 and run the
          simulation again.
        </p>
      )}

      <div className="vp-batch-grid">
        {transactions.map((transaction) => (
          <article key={transaction.transactionId} className="vp-batch-select">
            <header className="batch-head">
              <h3>{transaction.studentName}</h3>
              <span className={`badge ${transaction.status === 'confirmed' ? 'green' : 'yellow'}`}>
                {transaction.status}
              </span>
            </header>
            <p className="muted vp-batch-meta">
              {transaction.program || '—'} ·{' '}
              {transaction.year ? `Year ${transaction.year}` : '—'} ·{' '}
              {transaction.institutionalId || '—'} · {transaction.phone}
            </p>
            <p className="muted vp-batch-meta">✉️ {transaction.email || '—'}</p>
            <p className="vp-batch-amount">{money(transaction.amount)} ETB</p>
            <p className="muted vp-batch-meta">
              {money(transaction.dailyRate)} ETB/day × {transaction.durationDays} days
            </p>
            <p className="muted vp-batch-meta">Reference: <b>{transaction.reference}</b></p>
            {transaction.otp && (
              <p className="vp-status-note">
                Simulated OTP: <b>{transaction.otp}</b>
              </p>
            )}
          </article>
        ))}
      </div>

      <p className="muted">
        This is an academic simulation — no real money is transferred. The next step
        records the Finance settlement reference.
      </p>
    </>
  );
}
