import { useEffect, useState } from 'react';
import api from '../../api/axios';
import FinancePortal from './FinancePortal';
import StatusBadge from '../../components/StatusBadge';
import StudentInfoTable from '../../components/StudentInfoTable';

export default function BatchPayment() {
  const [batches, setBatches] = useState([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);

  const load = () =>
    api.get('/finance/batches')
      .then(r => setBatches(r.data.batches || []))
      .catch(e => setErr(e.response?.data?.message || 'Failed to load batches'));
  useEffect(() => { load(); }, []);

  // Pay every student in the batch simultaneously in ONE backend call.
  // Each student's amount = daily rate × their own internship days; TeleBirr
  // transactions are created + auto-confirmed, then all offices and students
  // are notified. No per-request loops needed.
  const payBatch = async (b) => {
    setBusy(b._id); setMsg(''); setErr(''); setResult(null);
    try {
      const { data } = await api.post(`/finance/batches/${b._id}/pay-all`);
      const results = data.results || [];
      const ok = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success);
      const alreadyPaid = results.filter(r => r.alreadyPaid);

      const summary = data.alreadyPaid || (results.length === 0 && ok === 0)
        ? `✅ Batch "${b.batchName}": every student was already paid — the batch is now finalised.`
        : `✅ Batch "${b.batchName}": ${ok} of ${results.length} students paid via TeleBirr.` +
          (alreadyPaid.length ? ` ${alreadyPaid.length} were already paid earlier.` : '') +
          (failed.length
            ? ` Failed: ${failed.map(f => `${f.student || f.request} (${f.reason})`).join('; ')}`
            : ' All offices and students notified.');

      setMsg(summary);
      setResult({
        batchId: b._id,
        batchName: b.batchName,
        rows: results,
        requests: b.requests || [],
      });
      load();
    } catch (e) {
      setErr(e.response?.data?.message || 'Batch payment failed');
    } finally {
      setBusy('');
    }
  };

  const pendingBatches = batches.filter(b => b.status === 'pending_finance');

  return (
    <FinancePortal>
      <h1>Batch Payment</h1>
      <p>
        Pay an entire approved batch in ONE click. Each student's amount is
        <b> daily rate × their internship days</b>, sent via the simulated
        TeleBirr flow — all students are paid simultaneously and every office
        and student is notified automatically. Review the complete student
        information below before paying.
      </p>
      {msg && <p className="success" style={{ whiteSpace: 'pre-line' }}>{msg}</p>}
      {err && <p className="error">{err}</p>}

      {pendingBatches.length === 0 && (
        <p className="empty">No batches waiting for payment.</p>
      )}

      {pendingBatches.map(b => (
        <div key={b._id} className="batch-card">
            <div className="batch-head">
              <h3>{b.batchName}</h3>
              <StatusBadge status={b.status} />
              <span className="muted">
                {b.batchCode ? `${b.batchCode} · ` : ''}
                {b.semester} · {b.academicYear}
              </span>
            </div>
            <p>
              {b.studentCount ?? b.students?.length ?? 0} student(s) ·{' '}
              <b>{Number(b.totalAmount || 0).toLocaleString()} ETB</b>
            </p>

            <StudentInfoTable
              requests={b.requests}
              showOrg
              showDuration
              showStatus
              emptyText="No pending students — every student in this batch may already be paid."
            />

            <div className="batch-actions">
              <button
                className="btn primary"
                disabled={busy === b._id}
                onClick={() => payBatch(b)}
              >
                {busy === b._id ? 'Processing…' : 'Pay Entire Batch'}
              </button>
            </div>
          </div>
      ))}

      {/* Result stays visible after the paid batch leaves the pending list. */}
      {result && (
        <div className="batch-card">
          <div className="batch-head">
            <h3>Payment result — {result.batchName}</h3>
          </div>
          <div className="student-info-wrap">
            <table className="table student-info-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Student</th>
                  <th>University ID</th>
                  <th>Program / Year</th>
                  <th>Phone</th>
                  <th>Organization</th>
                  <th>Amount</th>
                  <th>Reference</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => {
                  const request = result.requests.find(r => String(r._id) === String(row.request));
                  const student = request?.student || {};
                  return (
                    <tr key={row.request || i}>
                      <td className="student-info-index">{i + 1}</td>
                      <td className="student-info-name">
                        <b>{row.student || student.fullName || 'Unknown student'}</b>
                        {student.email && <small className="student-info-sub">{student.email}</small>}
                      </td>
                      <td className="cell-id">{student.institutionalId || '—'}</td>
                      <td>
                        {student.program || '—'}
                        <small className="student-info-sub">
                          {student.year ? `Year ${student.year}` : (student.semester || '—')}
                        </small>
                      </td>
                      <td>{row.phone || student.phone || '—'}</td>
                      <td>{request?.return?.orgName || request?.orgName || '—'}</td>
                      <td>{row.amount != null ? `${Number(row.amount).toLocaleString()} ETB` : '—'}</td>
                      <td>{row.reference || '—'}</td>
                      <td>
                        {row.success
                          ? (row.alreadyPaid ? '✅ Already paid' : '✅ Paid')
                          : `❌ ${row.reason || 'Failed'}`}
                      </td>
                    </tr>
                  );
                })}
                {result.rows.length === 0 && (
                  <tr><td colSpan={9}>Every student was already paid — the batch is finalised.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </FinancePortal>
  );
}
