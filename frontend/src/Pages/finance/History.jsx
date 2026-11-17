import { useEffect, useState } from 'react';
import api from '../../api/axios';
import FinancePortal from './FinancePortal';
import StatusBadge from '../../components/StatusBadge';

// Function 12: view payment history. Uses GET /finance/history which returns
// { payments: [{ request, transaction }], pagination } — the old page called a
// non-existent /finance/transactions endpoint and rendered nothing.
export default function History() {
  const [payments, setPayments] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/finance/history', { params: { page, limit: 20 } })
      .then(r => {
        setPayments(r.data.payments || []);
        setPagination(r.data.pagination || null);
      })
      .catch(e => setErr(e.response?.data?.message || 'Failed to load payment history'))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <FinancePortal>
      <h1>Payment History</h1>
      <p className="muted">Every payment request with its TeleBirr transaction reference and status.</p>

      {err && <p className="error">{err}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && payments.length === 0 && !err && (
        <p className="muted">No payment records yet.</p>
      )}

      {!loading && payments.length > 0 && (
        <table className="table">
          <thead>
            <tr><th>Student</th><th>Batch</th><th>Amount</th><th>Reference</th><th>Txn Status</th><th>Date</th></tr>
          </thead>
          <tbody>
            {payments.map(({ request: r, transaction: t }) => (
              <tr key={r._id}>
                <td>
                  {r.student?.fullName || '—'}<br />
                  <small className="muted">{r.student?.institutionalId || ''}</small>
                </td>
                <td>{r.batch?.batchName || '—'}</td>
                <td>{r.amount} ETB</td>
                <td>{t?.reference || <span className="muted">not paid yet</span>}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>{new Date(r.updatedAt || r.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="batch-actions">
          <button className="btn secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span className="muted">Page {pagination.page} of {pagination.pages}</span>
          <button className="btn secondary" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </FinancePortal>
  );
}