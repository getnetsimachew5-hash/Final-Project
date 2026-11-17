import StatusBadge from '../../../components/StatusBadge';
import {
  batchTotal,
  money,
  pendingRequestsOf,
  shortDate,
  studentLabel,
  studentPhone,
} from './helpers';

// FUNCTION 1 — View approved payment requests.
// Source: GET /finance/batches (batches authorized by the Administrative VP
// and moved directly to `pending_finance`).
export default function Step1Approved({ batches, loading, error, selectedId, onSelect, onRefresh }) {
  return (
    <>
      <div className="vp-panel-head">
        <h2>1. View approved payment requests</h2>
        <p className="muted">
          These batches were authorized by the <b>Administrative VP</b> and are waiting for
          TeleBirr payment. Select one to start the Finance workflow.
        </p>
      </div>

      <div className="batch-actions">
        <button className="btn secondary" type="button" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh list'}
        </button>
        <span className="chip">{batches.length} waiting</span>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading approved payment requests…</p>}

      {!loading && batches.length === 0 && (
        <p className="muted">No approved requests are waiting for Finance payment.</p>
      )}

      <div className="vp-batch-grid">
        {batches.map((batch) => {
          const selected = batch._id === selectedId;
          const pending = pendingRequestsOf(batch);

          return (
            <article key={batch._id} className={`vp-batch-select${selected ? ' selected' : ''}`}>
              <header className="batch-head">
                <h3>{batch.batchName}</h3>
                <StatusBadge status={batch.status} />
              </header>

              <p className="muted vp-batch-meta">
                {batch.semester} · {batch.academicYear} · {pending.length} student(s)
              </p>
              <p className="vp-batch-amount">{money(batch.authorizedAmount || batchTotal(batch))} ETB</p>

              {batch.authorizedAmount > 0 && (
                <span className="badge blue">Authorized by Admin VP</span>
              )}
              {batch.financePaymentMode && (
                <span className="badge yellow">
                  {batch.financePaymentMode === 'individual' ? 'Individual payment' : 'Batch payment'} selected
                </span>
              )}

              {batch.paymentReference && (
                <p className="muted vp-batch-meta">
                  Admin VP reference: <b>{batch.paymentReference}</b>
                </p>
              )}

              <ul className="vp-mini-students">
                {pending.slice(0, 4).map((request) => (
                  <li key={request._id}>
                    <span>{studentLabel(request)}</span>
                    <small className="muted">
                      {request.student?.program || '—'} ·{' '}
                      {request.student?.year ? `Year ${request.student.year}` : '—'} ·{' '}
                      {studentPhone(request) || request.student?.institutionalId}
                    </small>
                  </li>
                ))}
                {pending.length > 4 && <li className="muted">+{pending.length - 4} more</li>}
              </ul>

              <p className="muted vp-batch-meta">
                Authorized {shortDate(batch.paymentConfirmedAt || batch.authorizedAt)}
              </p>

              <button
                type="button"
                className={`btn ${selected ? 'secondary' : 'primary'}`}
                onClick={() => onSelect(batch)}
              >
                {selected
                  ? 'Selected ✓'
                  : batch.financePaymentMode
                    ? 'Resume payment workflow'
                    : 'Select request'}
              </button>
            </article>
          );
        })}
      </div>
    </>
  );
}
