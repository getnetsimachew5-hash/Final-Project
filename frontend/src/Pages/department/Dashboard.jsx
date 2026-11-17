import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import DepartmentPortal from './DepartmentPortal';
import StatusBadge from '../../components/StatusBadge';
import {
  DashboardPage,
  DashboardHero,
  DashboardSnapshot,
  DashboardKpi,
  DashboardPanel,
  DashboardEmpty,
  DashboardAttention,
  DashboardAction,
} from '../../components/DashboardUI';

const fmt = (n) => (Number(n) || 0).toLocaleString();

// Computed once when the module loads (keeps the render pure).
const TODAY_LABEL = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export default function Dashboard() {
  const { user } = useAuth();

  const [subs, setSubs] = useState({ returns: [], letters: [] });
  const [batches, setBatches] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    Promise.all([
      api.get('/department/submissions')
        .then(r => r.data)
        .catch(() => ({ returns: [], letters: [] })),
      api.get('/department/batches')
        .then(r => (Array.isArray(r.data) ? r.data : (r.data?.batches || [])))
        .catch(() => []),
      api.get('/department/requests')
        .then(r => (Array.isArray(r.data) ? r.data : (r.data?.requests || [])))
        .catch(() => []),
    ])
      .then(([s, b, q]) => {
        if (!active) return;
        setSubs({
          returns: Array.isArray(s?.returns) ? s.returns : [],
          letters: Array.isArray(s?.letters) ? s.letters : [],
        });
        setBatches(b);
        setRequests(q);
      })
      .catch(() => {
        if (active) setError('Some dashboard data could not be loaded. Please refresh the page.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const returns = subs.returns;

  /* Automatic totals — balance is always daily rate × internship days */
  const totalStudents = requests.length;
  const totalDays = requests.reduce((n, q) => n + (Number(q.durationDays) || 0), 0);
  const dailyRate = Number(requests[0]?.dailyRate ?? 100) || 100;
  const totalBalance = requests.reduce((n, q) => n + (Number(q.amount) || 0), 0);

  const paidCount = returns.filter(r => r.paymentStatus === 'paid').length;
  const pendingCount = returns.filter(r => r.paymentStatus === 'pending').length;
  const notBatchedCount = returns.filter(
    r => r.paymentStatus !== 'paid' && r.paymentStatus !== 'pending'
  ).length;

  const incompleteCount = returns.filter(r => (r.missingInfo || []).length > 0).length;
  const unverifiedCount = returns.filter(r => !r.verified).length;
  const readyCount = returns.filter(r => (
    r.verified
    && !(r.missingInfo || []).length
    && !r.alreadyBatched
    && r.paymentStatus !== 'paid'
    && r.paymentStatus !== 'pending'
    && !(r.paymentReopenAllowed && !r.paymentReopenRequestedAt)
  )).length;

  const paidPercent = returns.length
    ? Math.round((paidCount / returns.length) * 100)
    : 0;

  const paidStudents = returns.filter(r => r.paymentStatus === 'paid');
  const unpaidStudents = returns.filter(r => r.paymentStatus !== 'paid');

  const displayName = user?.fullName || 'Officer';
  const recent = returns.slice(0, 8);

  return (
    <DepartmentPortal>
      <DashboardPage>
        <DashboardHero
          badge={`📅 ${TODAY_LABEL}`}
          title={`Welcome back, ${displayName}`}
          description="Review student submissions, verify records, and move internship payments forward — everything you need is one click away."
          actions={[
            { to: '/cs-dept/submissions', label: 'Review submissions', icon: '📋', variant: 'light' },
            { to: '/cs-dept/forward', label: 'Forward to College', icon: '➡️' },
          ]}
          snapshot={(
            <DashboardSnapshot
              label="Payment snapshot"
              value={`${fmt(totalBalance)} ETB`}
              meta={[
                `${totalStudents} student${totalStudents === 1 ? '' : 's'}`,
                `${fmt(totalDays)} day${totalDays === 1 ? '' : 's'}`,
                `${dailyRate} ETB/day`,
              ]}
              progress={paidPercent}
              progressLabel="Students already paid"
              foot={[
                { label: 'paid', value: paidCount },
                { label: 'pending', value: pendingCount },
                { label: 'complete', value: `${paidPercent}%` },
              ]}
            />
          )}
        />

        {error && <p className="error">{error}</p>}
        {loading && <p className="dash-loading">Loading your dashboard…</p>}

        <section className="dash-kpis" aria-label="Key statistics">
          <DashboardKpi
            icon="📄"
            label="Total submissions"
            value={fmt(returns.length)}
            trend={`${subs.letters.length} letters`}
            sub="Return forms received from students"
            color="#059669"
          />
          <DashboardKpi
            icon="💳"
            label="Payment batches"
            value={fmt(batches.length)}
            trend={`${pendingCount} pending`}
            sub="Batches created by this department"
            color="#2563eb"
          />
          <DashboardKpi
            icon="✅"
            label="Ready for batch"
            value={fmt(readyCount)}
            trend={`${unverifiedCount} to verify`}
            sub="Verified and complete records"
            color="#d97706"
          />
          <DashboardKpi
            icon="💰"
            label="Total balance"
            value={<>{fmt(totalBalance)} <small>ETB</small></>}
            trend={`${notBatchedCount} not batched`}
            sub="Across all student payment requests"
            color="#7c3aed"
          />
        </section>

        <section className="cs-payment-board" aria-label="Paid and unpaid students">
          <div className="cs-payment-board-head">
            <div>
              <h2>Students by payment position</h2>
              <p>Paid students are kept separate from students still waiting for payment.</p>
            </div>
            <Link className="btn secondary" to="/cs-dept/submissions">Open full student list →</Link>
          </div>

          <div className="dash-split">
            <div className="cs-payment-column unpaid">
              <header>
                <div>
                  <span className="cs-column-kicker">Unpaid</span>
                  <h3>Students still in the pipeline</h3>
                </div>
                <span className="chip">{unpaidStudents.length}</span>
              </header>
              {unpaidStudents.length === 0 ? (
                <DashboardEmpty icon="✅" title="No unpaid students">
                  Every student in the current list has been paid.
                </DashboardEmpty>
              ) : (
                <ul className="cs-student-list">
                  {unpaidStudents.slice(0, 8).map((r) => (
                    <li key={r._id}>
                      <div className="cs-student-main">
                        <strong>{r.student?.fullName || 'Unknown student'}</strong>
                        <small>{r.student?.institutionalId || '—'} · {r.orgName || 'No organization'}</small>
                      </div>
                      <div className="cs-student-side">
                        {r.paymentReopenAllowed ? (
                          <span className="cs-chip">🔓 Update window</span>
                        ) : r.paymentStatus === 'pending' ? (
                          <StatusBadge status={r.batchInfo?.status || 'pending_department'} />
                        ) : (
                          <span className="cs-chip muted">Not batched</span>
                        )}
                        <small>
                          {r.paymentReopenAllowed && !r.paymentReopenRequestedAt
                            ? 'Waiting for resubmission'
                            : r.batchInfo?.batchName || 'No batch yet'}
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {unpaidStudents.length > 8 && (
                <Link className="cs-column-more" to="/cs-dept/submissions">+{unpaidStudents.length - 8} more students →</Link>
              )}
            </div>

            <div className="cs-payment-column paid">
              <header>
                <div>
                  <span className="cs-column-kicker">Paid</span>
                  <h3>Students already paid</h3>
                </div>
                <span className="chip">{paidStudents.length}</span>
              </header>
              {paidStudents.length === 0 ? (
                <DashboardEmpty icon="💳" title="No paid students yet">
                  Completed TeleBirr payments will appear here.
                </DashboardEmpty>
              ) : (
                <ul className="cs-student-list">
                  {paidStudents.slice(0, 8).map((r) => (
                    <li key={r._id}>
                      <div className="cs-student-main">
                        <strong>{r.student?.fullName || 'Unknown student'}</strong>
                        <small>{r.student?.institutionalId || '—'} · {r.orgName || 'No organization'}</small>
                      </div>
                      <div className="cs-student-side">
                        <span className="ok-chip">💰 Paid</span>
                        <small>{r.batchInfo?.batchName || 'Payment batch'}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {paidStudents.length > 8 && (
                <Link className="cs-column-more" to="/cs-dept/submissions">+{paidStudents.length - 8} more students →</Link>
              )}
            </div>
          </div>

          <div className="cs-batch-create">
            <div>
              <strong>Ready to create the next payment batch?</strong>
              <span>Select verified, complete, unpaid students from the batch page.</span>
            </div>
            <Link className="btn primary" to="/cs-dept/batch">💳 Create payment batch</Link>
          </div>
        </section>

        <section className="dash-grid">
          <DashboardPanel
            title="Recent submissions"
            subtitle="The latest return forms submitted by students."
            action={<Link to="/cs-dept/submissions">View all →</Link>}
            flush
          >
            {recent.length === 0 ? (
              <DashboardEmpty icon="📭" title="No submissions yet">
                Waiting for students to submit their internship return forms.
              </DashboardEmpty>
            ) : (
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Organization</th>
                      <th>Submitted</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map(r => (
                      <tr key={r._id}>
                        <td data-label="Student">
                          <span className="dash-student">
                            <strong>{r.student?.fullName || '—'}</strong>
                            <small>{r.student?.institutionalId || '—'}</small>
                          </span>
                        </td>
                        <td data-label="Organization">
                          <span className="dash-org" title={r.orgName || ''}>
                            {r.orgName || '—'}
                          </span>
                        </td>
                        <td data-label="Submitted">
                          {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}
                        </td>
                        <td data-label="Status">
                          <StatusBadge status={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DashboardPanel>

          <div className="dash-side">
            <DashboardPanel title="Payment summary" subtitle="Auto-calculated from student requests.">
              <div className="dash-summary-list">
                <div className="dash-summary-row"><span>Total students</span><b>{fmt(totalStudents)}</b></div>
                <div className="dash-summary-row"><span>Total days</span><b>{fmt(totalDays)}</b></div>
                <div className="dash-summary-row"><span>Daily rate</span><b>{fmt(dailyRate)} ETB</b></div>
                <div className="dash-summary-row"><span>Total balance</span><b className="money">{fmt(totalBalance)} ETB</b></div>
                <div className="dash-summary-row"><span>Pending payment</span><b>{fmt(pendingCount)}</b></div>
                <div className="dash-summary-row"><span>Already paid</span><b>{fmt(paidCount)}</b></div>
              </div>
            </DashboardPanel>

            <DashboardPanel title="Needs attention" subtitle="Keep the pipeline moving.">
              <div className="dash-attention">
                <DashboardAttention
                  to="/cs-dept/submissions"
                  icon="⚠️"
                  title="Incomplete records"
                  subtitle="Missing student information"
                  count={incompleteCount}
                />
                <DashboardAttention
                  to="/cs-dept/verify"
                  icon="⏳"
                  title="Pending verification"
                  subtitle="Records waiting for review"
                  count={unverifiedCount}
                />
                <DashboardAttention
                  to="/cs-dept/batch"
                  icon="📦"
                  title="Ready for batch"
                  subtitle="Verified and complete"
                  count={readyCount}
                />
              </div>
            </DashboardPanel>

            <DashboardPanel title="Quick actions" subtitle="Jump straight to a task.">
              <div className="dash-actions">
                <DashboardAction to="/cs-dept/verify" icon="✅" label="Verify students" />
                <DashboardAction to="/cs-dept/batch" icon="💳" label="Create batch" />
                <DashboardAction to="/cs-dept/forward" icon="➡️" label="Forward to College" />
                <DashboardAction to="/cs-dept/messages" icon="💬" label="Messages" />
              </div>
            </DashboardPanel>
          </div>
        </section>
      </DashboardPage>
    </DepartmentPortal>
  );
}
