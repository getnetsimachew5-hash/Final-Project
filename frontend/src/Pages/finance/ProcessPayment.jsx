import { useEffect, useState } from 'react';
import api from '../../api/axios';
import FinancePortal from './FinancePortal';
import StatusBadge from '../../components/StatusBadge';

const dash = (value) => {
  const text = String(value ?? '').trim();
  return text || '—';
};

const orgOf = (r) => r.return?.orgName || r.orgName || '—';

export default function ProcessPayment() {
  const [requests, setRequests] = useState([]);
  const [settings, setSettings] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  // current payment screen: { txnId, reference, amount, otp, ... }
  const [pay, setPay] = useState(null);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      // Only students forwarded by the Administrative VP are payable. Showing
      // earlier-stage requests here made Finance look broken because those
      // rows have no payment action.
      const r = await api.get('/finance/requests?status=pending_finance');
      setRequests(r.data.requests || r.data || []);
      setErr('');
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to load payment requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    api.get('/finance/settings').then(r => setSettings(r.data)).catch(() => {});
  }, []);

  // Step 1: assign amount + insert student phone → OTP is generated
  const startPayment = async (r) => {
    setErr(''); setMsg('');
    setBusy(`p:${r._id}`);
    try {
      const { data } = await api.post(`/finance/requests/${r._id}/process`, {
        phone: phone || r.student?.phone || r.studentPhone,
      });

      // A retried click on an already-confirmed payment must not open the OTP
      // dialog again — the money was already sent.
      if (data.alreadyPaid || data.status === 'confirmed') {
        setMsg(
          (data.message || 'This payment was already confirmed.')
          + (data.batchFinalized ? ' The batch is now marked PAID.' : '')
        );
        setPay(null);
        load();
        return;
      }

      setPay({ ...data, studentName: r.student?.fullName, student: r.student });
      setOtp('');
      setMsg(data.message || `OTP generated and sent to ${data.phone} (simulated on screen).`);
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to start payment');
    } finally {
      setBusy('');
    }
  };

  // Step 2: enter OTP code → payment confirmed
  const confirmOtp = async () => {
    if (!pay?.txnId) return;
    setErr(''); setMsg(''); setBusy('confirm');
    try {
      const { data } = await api.post(`/finance/transactions/${pay.txnId}/confirm`, { otp });
      setMsg(
        (data.message || '✅ Payment confirmed! Money sent via TeleBirr.')
        + (data.batchFinalized ? ' Every student is paid — the batch is now marked PAID.' : '')
      );
      setPay(null); setPhone(''); setOtp('');
      load();
    } catch (e) {
      setErr(e.response?.data?.message || 'OTP verification failed');
    } finally {
      setBusy('');
    }
  };

  return (
    <FinancePortal>
      <h1>Individual Payment (TeleBirr)</h1>
      <p className="muted">
        Only students whose batches have been authorized by the Administrative VP and
        forwarded to Finance are shown here. Paying the last student completes the
        batch automatically.
      </p>

      {settings && (
        <p className="muted">
          Current daily rate: <b>{settings.dailyRate} ETB/day</b> — each amount is
          calculated automatically as <b>daily rate × internship days</b> in the
          guided workflow.
        </p>
      )}
      {msg && <p className="success">{msg}</p>}
      {err && <p className="error">{err}</p>}
      {loading && <p className="muted">Loading payment requests…</p>}
      {!loading && requests.length === 0 && (
        <p className="empty">
          No payment requests waiting for Finance. Students still at the
          Department, College, Academic VP or Admin VP will appear here after the
          Administrative VP forwards their batch.
        </p>
      )}

      {requests.length > 0 && (
        <div className="student-info-wrap">
          <table className="table student-info-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Student</th>
                <th>University ID</th>
                <th>Program</th>
                <th>Year / Semester</th>
                <th>TeleBirr phone</th>
                <th>Organization</th>
                <th>Internship period</th>
                <th>Days / rate</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r, index) => {
                const student = r.student || {};
                const start = r.return?.startDate;
                const end = r.return?.endDate;
                const period = start || end
                  ? `${start ? new Date(start).toLocaleDateString() : '—'} → ${end ? new Date(end).toLocaleDateString() : '—'}`
                  : '—';
                return (
                  <tr key={r._id}>
                    <td className="student-info-index">{index + 1}</td>
                    <td className="student-info-name">
                      <b>{student.fullName || 'Unknown student (account removed)'}</b>
                      {student.email && <small className="student-info-sub">{student.email}</small>}
                      {student.username && <small className="student-info-sub">Username: {student.username}</small>}
                    </td>
                    <td className="cell-id">{dash(student.institutionalId)}</td>
                    <td>{dash(student.program)}</td>
                    <td>{student.year ? `Year ${student.year}` : dash(student.semester)}</td>
                    <td>{dash(r.studentPhone || student.phone)}</td>
                    <td>{orgOf(r)}</td>
                    <td>{period}</td>
                    <td>
                      {r.durationDays != null ? `${r.durationDays} day(s)` : '—'}
                      <small className="student-info-sub">{r.dailyRate ?? '?'} ETB/day</small>
                    </td>
                    <td><b>{Number(r.amount || 0).toLocaleString()} ETB</b></td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>
                      {r.status === 'pending_finance' && (
                        <button
                          className="btn primary"
                          disabled={busy === `p:${r._id}`}
                          onClick={() => startPayment(r)}
                        >
                          {busy === `p:${r._id}` ? 'Starting…' : 'Process TeleBirr Payment'}
                        </button>
                      )}
                      {r.status === 'paid' && <span>✅ Paid</span>}
                      {r.status === 'confirmed' && <span>✅ Confirmed</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Step 1 → step 2 modal: shows computed amount, phone, OTP entry */}
      {pay && (
        <div className="modal">
          <div>
            <h2>Simulated TeleBirr Payment</h2>
            <p>Student: <b>{pay.studentName}</b></p>
            {pay.student?.institutionalId && (
              <p className="muted">
                ID {pay.student.institutionalId}
                {pay.student.program ? ` · ${pay.student.program}` : ''}
                {pay.student.year ? ` · Year ${pay.student.year}` : ''}
              </p>
            )}
            <p>Reference: <b>{pay.reference}</b></p>
            <p>
              Amount: <b>{pay.amount} ETB</b>{' '}
              <small className="muted">
                ({pay.dailyRate} ETB/day × {pay.durationDays} days)
              </small>
            </p>
            <p>Phone: <b>{pay.phone}</b></p>
            <p className="muted">
              OTP sent to the student phone (simulation): <b>{pay.otp}</b>
            </p>

            <label htmlFor="otp-input"><b>Enter OTP code:</b></label>
            <input
              id="otp-input"
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
            />

            <p className="muted">This is an academic simulation. No real money is transferred.</p>
            <button className="btn primary" onClick={confirmOtp} disabled={otp.length !== 6 || busy === 'confirm'}>
              {busy === 'confirm' ? 'Confirming…' : 'Confirm Payment'}
            </button>
            <button className="btn" onClick={() => setPay(null)} disabled={busy === 'confirm'}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </FinancePortal>
  );
}
