import { useEffect, useState } from 'react';
import api from '../../api/axios';
import FinancePortal from './FinancePortal';

// Function 11: generate payment reports. Uses GET /finance/report which returns
// { summary, byStatus, recentPayments } — the old page called a non-existent
// /finance/transactions endpoint and always showed zeros.
export default function Reports() {
  const [report, setReport] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/finance/report')
      .then(r => setReport(r.data))
      .catch(e => setErr(e.response?.data?.message || 'Failed to load report'))
      .finally(() => setLoading(false));
  }, []);

  // Build a CSV from the report's recent payments (server-side limit: 10 most recent).
  const exportCSV = () => {
    if (!report) return;
    const rows = [['Reference', 'Student', 'Batch', 'Amount', 'Status', 'Date']];
    (report.recentPayments || []).forEach(r =>
      rows.push([
        r.transaction?.reference || '',
        r.student?.fullName || '',
        r.batch?.batchName || '',
        r.amount ?? '',
        r.status ?? '',
        r.createdAt || '',
      ])
    );
    const csv = rows.map(r => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `sipms-payment-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmt = (n) => (Number(n) || 0).toLocaleString();

  return (
    <FinancePortal>
      <h1>Payment Reports</h1>
      <p className="muted">
        Summary of all internship payment requests and TeleBirr transactions.
      </p>

      {err && <p className="error">{err}</p>}
      {loading && <p className="muted">Generating report…</p>}

      {report && (
        <>
          <div className="stat-row">
            <div className="stat-card">
              <span className="stat-num">{fmt(report.summary.totalPayments)}</span>
              <span>Total payment requests</span>
            </div>
            <div className="stat-card">
              <span className="stat-num">{fmt(report.summary.paidCount)}</span>
              <span>Paid (PAID status)</span>
            </div>
            <div className="stat-card">
              <span className="stat-num">{fmt(report.summary.pendingCount)}</span>
              <span>Pending finance</span>
            </div>
            <div className="stat-card">
              <span className="stat-num">{fmt(report.summary.totalAmount)} ETB</span>
              <span>Total paid amount</span>
            </div>
          </div>

          <h2>Breakdown by status</h2>
          {(report.byStatus || []).length === 0 && <p className="muted">No data yet.</p>}
          <table className="table">
            <thead><tr><th>Status</th><th>Count</th><th>Amount</th></tr></thead>
            <tbody>
              {(report.byStatus || []).map(s => (
                <tr key={s._id}>
                  <td>{s._id}</td>
                  <td>{s.count}</td>
                  <td>{fmt(s.totalAmount)} ETB</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Recent payments</h2>
          <table className="table">
            <thead><tr><th>Student</th><th>Batch</th><th>Amount</th><th>Reference</th><th>Status</th></tr></thead>
            <tbody>
              {(report.recentPayments || []).map(r => (
                <tr key={r._id}>
                  <td>{r.student?.fullName || '—'}</td>
                  <td>{r.batch?.batchName || '—'}</td>
                  <td>{fmt(r.amount)} ETB</td>
                  <td>{r.transaction?.reference || <span className="muted">—</span>}</td>
                  <td>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="batch-actions">
            <button className="btn primary" onClick={exportCSV}>⬇ Export CSV</button>
          </div>
          <p className="muted">Report generated: {new Date(report.generatedAt).toLocaleString()}</p>
        </>
      )}
    </FinancePortal>
  );
}