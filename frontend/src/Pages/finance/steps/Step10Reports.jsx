import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../api/axios';
import StatusBadge from '../../../components/StatusBadge';
import {
  actionLabel,
  apiError,
  dateTime,
  money,
  roleLabel,
} from './helpers';

// FUNCTION 10 — Generate payment reports & maintain history.
// Combines the batch trail, per-student transaction references, and the global
// Finance report. The officer can export a CSV and record report generation.
export default function Step10Reports({ batchId, batch, onGenerateReport }) {
  const [history, setHistory] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [historyResponse, reportResponse] = await Promise.all([
        api.get(`/finance/batches/${batchId}/history`),
        api.get('/finance/report'),
      ]);
      setHistory(historyResponse.data);
      setReport(reportResponse.data);
    } catch (e) {
      setError(apiError(e, 'Failed to load the payment report and history'));
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await api.post(`/finance/batches/${batchId}/report`);
      onGenerateReport?.(response.data.batch);
      await load();
    } catch (e) {
      setError(apiError(e, 'Failed to generate the payment report'));
    } finally {
      setBusy(false);
    }
  };

  const exportCSV = () => {
    const rows = [[
      'Student', 'Institutional ID', 'Program', 'Year', 'Email', 'Phone',
      'Amount', 'TeleBirr Reference', 'Transaction Status', 'Request Status', 'Confirmed At',
    ]];

    for (const request of history?.requests || []) {
      const transaction = (history?.transactions || []).find(
        (item) => String(item.request?._id || item.request) === String(request._id)
      );
      rows.push([
        request.student?.fullName || '',
        request.student?.institutionalId || '',
        request.student?.program || '',
        request.student?.year || '',
        request.student?.email || '',
        request.student?.phone || transaction?.phone || request.studentPhone || '',
        request.amount ?? '',
        transaction?.reference || '',
        transaction?.status || '',
        request.status || '',
        transaction?.confirmedAt || '',
      ]);
    }

    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sipms-finance-${batch?.batchName || history?.batch?.batchName || 'payment'}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const summary = history?.summary;
  const trail = [...(history?.batch?.history || batch?.history || [])]
    .sort((a, z) => new Date(a.at || 0) - new Date(z.at || 0));

  return (
    <>
      <div className="vp-panel-head">
        <h2>10. Generate payment reports &amp; maintain history</h2>
        <p className="muted">
          The completed batch, every TeleBirr reference, and the full cross-office trail
          are kept for reporting and audit.
        </p>
      </div>

      <div className="batch-actions">
        <button className="btn secondary" type="button" onClick={load} disabled={loading || busy}>
          {loading ? 'Refreshing…' : 'Refresh report'}
        </button>
        <button className="btn primary" type="button" onClick={generate} disabled={busy || loading}>
          {busy ? 'Generating…' : 'Generate & record report'}
        </button>
        <button className="btn secondary" type="button" onClick={exportCSV} disabled={!history}>
          ⬇ Export CSV
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading report and history…</p>}

      {!loading && summary && (
        <>
          <div className="vp-summary-grid">
            <div className="vp-summary"><span>Students</span><b>{summary.studentCount}</b></div>
            <div className="vp-summary"><span>Paid</span><b>{summary.paidCount}</b></div>
            <div className="vp-summary"><span>Paid amount</span><b>{money(summary.paidAmount)} ETB</b></div>
            <div className="vp-summary">
              <span>Status</span>
              <b><StatusBadge status={history.batch.status} /></b>
            </div>
          </div>

          <p className="muted">
            Settlement reference: <b>{summary.reference || '—'}</b> · Mode:{' '}
            <b>{summary.mode || '—'}</b> · Report generated:{' '}
            <b>{history.batch.financeReportGeneratedAt
              ? dateTime(history.batch.financeReportGeneratedAt)
              : 'not yet'}</b>
          </p>

          <h3>Student payment records</h3>
          <div className="vp-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th><th>Program</th><th>Year</th><th>Phone</th><th>Email</th>
                  <th>Amount</th><th>Reference</th>
                  <th>TeleBirr status</th><th>Request status</th><th>Paid at</th>
                </tr>
              </thead>
              <tbody>
                {(history.requests || []).map((request) => {
                  const transaction = (history.transactions || []).find(
                    (item) => String(item.request?._id || item.request) === String(request._id)
                  );
                  return (
                    <tr key={request._id}>
                      <td>
                        {request.student?.fullName || 'Unknown'}<br />
                        <small className="muted">{request.student?.institutionalId || '—'}</small>
                      </td>
                      <td>{request.student?.program || '—'}</td>
                      <td>{request.student?.year ? `Year ${request.student.year}` : '—'}</td>
                      <td>{request.student?.phone || transaction?.phone || '—'}</td>
                      <td>{request.student?.email || '—'}</td>
                      <td>{money(request.amount)} ETB</td>
                      <td>{transaction?.reference || '—'}</td>
                      <td>{transaction?.status || 'not initiated'}</td>
                      <td><StatusBadge status={request.status} /></td>
                      <td>{transaction?.confirmedAt ? dateTime(transaction.confirmedAt) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h3>Full workflow history</h3>
          <ol className="vp-timeline">
            {trail.map((event, index) => (
              <li key={`${event.action}-${index}`} className={`vp-trail-item ${event.actor?.role || 'system'}`}>
                <span className="vp-trail-dot" aria-hidden="true" />
                <div>
                  <b>{actionLabel[event.action] || event.action}</b>
                  <small className="muted">
                    {event.actor?.fullName || 'System'} · {roleLabel[event.actor?.role] || 'System'}
                    {event.at ? ` · ${dateTime(event.at)}` : ''}
                  </small>
                  {event.comment && <p className="vp-trail-comment">“{event.comment}”</p>}
                </div>
              </li>
            ))}
            {trail.length === 0 && <li className="muted">No history events recorded.</li>}
          </ol>

          {report && (
            <>
              <h3>Finance totals</h3>
              <div className="vp-summary-grid">
                <div className="vp-summary">
                  <span>All payment requests</span><b>{report.summary?.totalPayments ?? 0}</b>
                </div>
                <div className="vp-summary">
                  <span>Paid requests</span><b>{report.summary?.paidCount ?? 0}</b>
                </div>
                <div className="vp-summary">
                  <span>Total paid</span><b>{money(report.summary?.totalAmount)} ETB</b>
                </div>
                <div className="vp-summary">
                  <span>Pending finance</span><b>{report.summary?.pendingCount ?? 0}</b>
                </div>
              </div>
              <p className="muted">
                Report generated {report.generatedAt ? dateTime(report.generatedAt) : '—'}.
              </p>
            </>
          )}
        </>
      )}

      <div className="batch-actions">
        <Link className="btn secondary" to="/finance/history">Open payment history →</Link>
        <Link className="btn secondary" to="/finance/reports">Open reports →</Link>
      </div>
    </>
  );
}
