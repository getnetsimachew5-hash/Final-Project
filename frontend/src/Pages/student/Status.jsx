import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import StudentPortal from './StudentPortal';

const fmtDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
};

const stateLabel = (stage, reopenAllowed) => {
  if (stage.previous) return 'Previous payment';
  if (stage.state === 'done') return 'Completed';
  if (stage.state === 'rejected') return 'Needs correction';
  if (stage.state === 'current') {
    if (stage.key === 'paid') return 'Paid';
    if (reopenAllowed) return 'Update window open';
    return 'In progress';
  }
  return 'Waiting';
};

export default function Status() {
  const [data, setData] = useState({ return: null, journey: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/student/status')
      .then((response) => { if (active) setData(response.data); })
      .catch((e) => { if (active) setError(e.response?.data?.message || 'Failed to load your status.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const ret = data.return;
  const journey = data.journey || [];
  const payment = data.paymentRequest;
  const paymentPhone = data.paymentPhone || data.profile?.phone || '';
  const reopen = data.reopenPermission || {};
  const paid = Boolean(data.paymentCompleted);
  const current = journey.find((stage) => stage.state === 'current')
    || journey.find((stage) => stage.state === 'rejected')
    || journey[journey.length - 1]
    || null;
  const batch = payment?.batch;

  return (
    <StudentPortal>
      <h1>Submission &amp; Payment Status</h1>
      <p className="stu-panel-sub">
        Track exactly where your information has reached: CS Department, College,
        Academic VP, Administrative VP, Finance, and finally payment.
      </p>

      {error && <p className="error">{error}</p>}
      {loading && <p className="stu-panel-sub">Loading your journey…</p>}

      {!loading && !ret ? (
        <div className="stu-empty">
          <span className="e-ico">📭</span>
          <p>You have not submitted anything yet. Fill in your return form to start the process.</p>
          <Link className="btn primary" to="/student/return">Start with the return form</Link>
        </div>
      ) : !loading && ret && (
        <>
          {reopen.allowed && (
            <div className="reopen-note">
              <strong>🔓 Update window open.</strong> The CS Department has allowed you to
              correct your information and request another payment.
              {reopen.reason && <> Reason: <b>{reopen.reason}</b>.</>}
              <div className="reopen-note-actions">
                <Link className="btn small primary" to="/student/return">Update return form →</Link>
                <Link className="btn small secondary" to="/student/profile">Update my information →</Link>
              </div>
            </div>
          )}

          {paid && (
            <div className="paid-note">
              ✅ <strong>Payment completed via TeleBirr.</strong>
              {payment && <> Amount: <b>{Number(payment.amount || 0).toLocaleString()} ETB</b>.</>}
              {data.paymentStatus?.reference && <> Reference: <b>{data.paymentStatus.reference}</b>.</>}
              {' '}A payment notification was added to your Messages &amp; Notifications page.
              Your information is locked after payment unless the CS Department opens an update window.
            </div>
          )}

          {!paid && !reopen.allowed && data.latestPaidRequest && (
            <div className="reopen-note">
              <strong>Previous payment completed.</strong> Your information is locked while the
              CS Department reviews the new cycle. Contact the CS Department if a correction is needed.
            </div>
          )}

          {ret.status === 'rejected' && ret.rejectionReason && (
            <div className="rejection-note">
              <strong>❌ Correction requested:</strong> {ret.rejectionReason}
              <br />
              <span style={{ color: '#7f1d1d' }}>
                Open the <b>Internship Return Form</b> page, correct your details and resubmit.
              </span>
            </div>
          )}

          <div className="stu-stats">
            <div className="stu-stat info">
              <span className="ico">📍</span>
              <div>
                <span className="lbl">Current stage</span>
                <span className="val">{current?.label || 'Submitted'}</span>
              </div>
            </div>
            <div className="stu-stat info">
              <span className="ico">{paid ? '💸' : '⏳'}</span>
              <div>
                <span className="lbl">Payment status</span>
                <span className="val">
                  {paid ? 'Paid' : ret.status === 'rejected' ? 'Needs correction' : 'In progress'}
                </span>
              </div>
            </div>
            <div className="stu-stat info">
              <span className="ico">📎</span>
              <div>
                <span className="lbl">Completion letter</span>
                <span className="val">{data.letter ? 'Uploaded' : 'Not uploaded'}</span>
              </div>
            </div>
            {payment && (
              <div className="stu-stat info">
                <span className="ico">💳</span>
                <div>
                  <span className="lbl">Payment amount</span>
                  <span className="val">{Number(payment.amount || 0).toLocaleString()} ETB</span>
                </div>
              </div>
            )}
            <div className="stu-stat info">
              <span className="ico">📱</span>
              <div>
                <span className="lbl">Registered TeleBirr phone</span>
                <span className="val">{paymentPhone || 'Missing'}</span>
              </div>
            </div>
          </div>

          <div className="stu-panel journey-panel">
            <div className="journey-panel-head">
              <div>
                <h2>Where your information has reached</h2>
                <p className="stu-panel-sub">
                  Each office confirms your information before it moves to the next stage.
                </p>
              </div>
              {batch && (
                <div className="journey-batch">
                  <span>Batch</span>
                  <b>{batch.batchName || 'Payment batch'}</b>
                  {batch.batchCode && <small>{batch.batchCode}</small>}
                </div>
              )}
            </div>

            <ol className="journey-list">
              {journey.map((stage, index) => (
                <li key={stage.key} className={`journey-step ${stage.state}`}>
                  <span className="journey-dot" aria-hidden="true">
                    {stage.state === 'done' ? '✓' : stage.state === 'rejected' ? '!' : index + 1}
                  </span>
                  <div className="journey-copy">
                    <div className="journey-title">
                      <strong>{stage.label}</strong>
                      <span className="journey-state">{stateLabel(stage, reopen.allowed)}</span>
                    </div>
                    <p>{stage.desc}</p>
                    {stage.at && <small>{fmtDate(stage.at)}</small>}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="stu-panel">
            <h2>What happens next</h2>
            {paid ? (
              <p className="muted">
                Your payment is complete. If you need a correction after payment, the CS
                Department can open a controlled update window for you.
              </p>
            ) : reopen.allowed ? (
              <p className="muted">
                Correct your information and resubmit the return form. The CS Department will
                verify it and create a new payment batch.
              </p>
            ) : (
              <p className="muted">
                You do not need to do anything while the current office reviews your request.
                You will receive a message if more information is needed.
              </p>
            )}
            <div className="journey-links">
              <Link className="btn secondary" to="/student/messages">Messages &amp; notifications</Link>
              <Link className="btn secondary" to="/student/history">Payment history</Link>
            </div>
          </div>
        </>
      )}
    </StudentPortal>
  );
}
