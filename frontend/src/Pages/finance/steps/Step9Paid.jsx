import StatusBadge from '../../../components/StatusBadge';
import { dateTime, money, paymentModeLabel } from './helpers';

// FUNCTION 9 — Change request status to PAID.
// TeleBirr confirmation has already marked each request paid and notified the
// student. This step finalises the batch (status = paid) and notifies offices.
export default function Step9Paid({ batch, confirmation, session }) {
  const results = confirmation?.results || [];
  const success = results.filter((result) => result.success);
  const failed = results.filter((result) => !result.success);
  const paidTransactions = (session?.transactions || []).filter(
    (transaction) => transaction.status === 'confirmed'
  );
  const confirmedCount = success.length || paidTransactions.length;

  return (
    <>
      <div className="vp-panel-head">
        <h2>9. Change request status to PAID</h2>
        <p className="muted">
          The student request is already marked PAID when the OTP is confirmed. This
          final step closes the batch when every student has been paid.
        </p>
      </div>

      <div className="vp-summary-grid">
        <div className="vp-summary">
          <span>Batch status</span>
          <b><StatusBadge status={batch.status} /></b>
        </div>
        <div className="vp-summary">
          <span>Mode</span>
          <b>{paymentModeLabel(batch.financePaymentMode)}</b>
        </div>
        <div className="vp-summary">
          <span>Confirmed</span>
          <b>{confirmedCount}</b>
        </div>
        <div className="vp-summary">
          <span>Amount</span>
          <b>{money(batch.financeConfirmedAmount)} ETB</b>
        </div>
      </div>

      {batch.status === 'paid' || batch.financePaidAt ? (
        <div className="vp-outcome approve">
          <h3>✅ Payment complete — status PAID</h3>
          <p>
            Batch <b>{batch.batchName}</b> was paid via TeleBirr on{' '}
            {dateTime(batch.financePaidAt || batch.financePaymentConfirmedAt)}.
            Reference: <b>{batch.financeReference || '—'}</b>.
          </p>
          <p className="muted">
            Each student received a payment notification on their phone. Other offices were
            notified that the batch is complete.
          </p>
        </div>
      ) : (
        <div className="vp-outcome approve">
          <h3>TeleBirr confirmed</h3>
          <p>
            {confirmedCount} student(s) have been paid. Press{' '}
            <b>Set status to PAID &amp; continue</b> to finalise the batch.
          </p>
        </div>
      )}

      {failed.length > 0 && (
        <div className="vp-outcome reject">
          <h3>Some payments could not be confirmed</h3>
          <ul>
            {failed.map((result) => (
              <li key={result.transactionId}>
                {result.studentName}: {result.reason}
              </li>
            ))}
          </ul>
          <p className="muted">
            Use the batch payment page or retry the failed students before finalising.
          </p>
        </div>
      )}

      {paidTransactions.length > 0 && (
        <div className="vp-table-wrap">
          <table className="table">
            <thead>
              <tr><th>Student</th><th>Amount</th><th>TeleBirr reference</th><th>Status</th></tr>
            </thead>
            <tbody>
              {paidTransactions.map((transaction) => (
                <tr key={transaction.transactionId}>
                  <td>{transaction.studentName}</td>
                  <td>{money(transaction.amount)} ETB</td>
                  <td>{transaction.reference}</td>
                  <td><span className="badge green">confirmed</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted">
        Students were notified automatically by TeleBirr when their payment was confirmed.
      </p>
    </>
  );
}
