import { useEffect, useState } from 'react';
import api from '../../api/axios';
import StudentPortal from './StudentPortal';
import StatusBadge from '../../components/StatusBadge';

export default function History() {
  const [payments, setPayments] = useState([]);
  const [fallback, setFallback] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Prefer the dedicated payment-history endpoint; if it is unavailable,
    // fall back to the simple status record so the page never breaks.
    api.get('/student/history')
      .then(r => {
        const p = r.data?.payments;
        if (Array.isArray(p) && p.length) setPayments(p);
        else return api.get('/student/status').then(s => setFallback(s.data.return));
      })
      .catch(() => api.get('/student/status').then(s => setFallback(s.data.return)).catch(() => {}))
      .finally(() => setLoading(false));
  }, []);

  const hasAny = payments.length > 0 || Boolean(fallback);

  return (
    <StudentPortal>
      <h1>Payment History</h1>
      <p className="stu-panel-sub">
        Every internship payment request associated with your account.
      </p>

      {loading ? (
        <div className="stu-empty"><p>Loading…</p></div>
      ) : !hasAny ? (
        <div className="stu-empty">
          <span className="e-ico">🧾</span>
          <p>No payment history yet. Once your submission enters the payment pipeline it will show up here.</p>
        </div>
      ) : (
        <div className="stu-pay">
          {payments.map(({ request, transaction }) => (
            <div key={request._id} className="stu-pay-row">
              <div className="p-main">
                <p className="p-org">{request.return?.orgName || 'Internship payment'}</p>
                <p className="p-meta">
                  {request.batch?.batchName ? `${request.batch.batchName} · ` : ''}
                  {new Date(request.createdAt).toLocaleDateString()}
                  {transaction?.reference ? <> · Ref <code>{transaction.reference}</code></> : null}
                </p>
              </div>
              <div className="p-right">
                <span className="p-amount">{(request.amount ?? 0).toLocaleString()} ETB</span>
                <StatusBadge status={request.status} />
              </div>
            </div>
          ))}

          {/* Fallback single-record view */}
          {payments.length === 0 && fallback && (
            <div className="stu-pay-row">
              <div className="p-main">
                <p className="p-org">{fallback.orgName || 'Internship payment'}</p>
                <p className="p-meta">{new Date(fallback.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="p-right">
                <StatusBadge status={fallback.status} />
              </div>
            </div>
          )}
        </div>
      )}
    </StudentPortal>
  );
}
