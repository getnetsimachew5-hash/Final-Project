import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import AcademicVPPortal from './AcademicVPPortal';
import StatusBadge from '../../components/StatusBadge';
import StudentInfoTable from '../../components/StudentInfoTable';
import {
  DashboardPage,
  DashboardHero,
  DashboardSnapshot,
  DashboardKpi,
  DashboardPanel,
  DashboardEmpty,
  DashboardAction,
} from '../../components/DashboardUI';

const fmt = (n) => (Number(n) || 0).toLocaleString();

const TODAY_LABEL = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

/**
 * Academic VP Dashboard — Function 1: View College-approved requests
 * Also shows the official role description and all 8 functions.
 */
const FUNCTIONS = [
  { num: 1, text: 'View College-approved requests',               icon: '👁️', link: '/academic-vp' },
  { num: 2, text: 'Review academic eligibility',                   icon: '🎓', link: '/academic-vp/eligibility' },
  { num: 3, text: 'Review supporting documents',                   icon: '📄', link: '/academic-vp/documents' },
  { num: 4, text: 'Endorse eligible request',                      icon: '✅', link: '/academic-vp/approved' },
  { num: 5, text: 'Reject if requirements not satisfied',          icon: '❌', link: '/academic-vp/approved' },
  { num: 6, text: 'Provide rejection comments',                    icon: '💬', link: '/academic-vp/approved' },
  { num: 7, text: 'Forward endorsed request to Administrative VP', icon: '📤', link: '/academic-vp/approved' },
  { num: 8, text: 'Monitor processed requests',                    icon: '📋', link: '/academic-vp/history' },
];

const totalOf = (b) =>
  Number(b?.totalAmount) ||
  (b?.requests || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

export default function Dashboard() {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get('/academic-vp/batches').then(r => r.data),
      api.get('/academic-vp/stats').then(r => r.data).catch(() => null),
    ])
      .then(([batchData, statsData]) => {
        if (!active) return;
        setBatches(batchData.batches || []);
        setStats(statsData);
      })
      .catch(e => {
        if (active) setErr(e.response?.data?.message || 'Failed to load dashboard data');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const pendingCount = stats?.pendingBatches ?? batches.length;
  const processedCount = stats?.totalProcessed ?? 0;
  const totalStudents = stats?.totalStudents
    ?? batches.reduce((sum, b) => sum + (b.requests?.length || b.studentCount || 0), 0);
  const totalAmount = batches.reduce((sum, b) => sum + totalOf(b), 0);
  const reviewedPercent = (pendingCount + processedCount) > 0
    ? Math.round((processedCount / (pendingCount + processedCount)) * 100)
    : 0;
  const displayName = user?.fullName || 'Officer';

  return (
    <AcademicVPPortal>
      <DashboardPage theme="avp">
        <DashboardHero
          badge={`📅 ${TODAY_LABEL}`}
          title={`Welcome back, ${displayName}`}
          description="Review the requests the College Office approved, verify academic eligibility and supporting documents, then endorse or reject each request with clear comments."
          actions={[
            { to: '/academic-vp/eligibility', label: 'Review eligibility', icon: '🎓', variant: 'light' },
            { to: '/academic-vp/documents', label: 'Supporting documents', icon: '📄' },
            { to: '/academic-vp/approved', label: 'Endorse / reject', icon: '✅' },
          ]}
          snapshot={(
            <DashboardSnapshot
              label="Academic review"
              value={`${pendingCount} batch${pendingCount === 1 ? '' : 'es'}`}
              meta={[
                `${totalStudents} student${totalStudents === 1 ? '' : 's'}`,
                `${fmt(totalAmount)} ETB in review`,
              ]}
              progress={reviewedPercent}
              progressLabel="Requests processed by this office"
              foot={[
                { label: 'pending', value: pendingCount },
                { label: 'processed', value: processedCount },
                { label: 'complete', value: `${reviewedPercent}%` },
              ]}
            />
          )}
        />

        {err && <p className="error">{err}</p>}
        {loading && <p className="dash-loading">Loading academic review queue…</p>}

        <section className="dash-kpis" aria-label="Key statistics">
          <DashboardKpi
            icon="📥"
            label="Pending review"
            value={fmt(pendingCount)}
            trend={`${batches.length} batches`}
            sub="College-approved requests awaiting review"
            color="#6366f1"
            to="/academic-vp/eligibility"
          />
          <DashboardKpi
            icon="👥"
            label="Students in review"
            value={fmt(totalStudents)}
            trend="eligibility"
            sub="Student requests in the academic pipeline"
            color="#2563eb"
          />
          <DashboardKpi
            icon="💰"
            label="Value in review"
            value={<>{fmt(totalAmount)} <small>ETB</small></>}
            trend={`${batches.length} batches`}
            sub="Total amount awaiting endorsement"
            color="#d97706"
          />
          <DashboardKpi
            icon="✅"
            label="Total processed"
            value={fmt(processedCount)}
            trend="handled"
            sub="Batches endorsed or rejected by this office"
            color="#059669"
            to="/academic-vp/history"
          />
        </section>

        <div className="avp-help">
          <strong>How to use this dashboard</strong>
          <ul>
            <li><b>Review eligibility</b> shows the requests waiting for an academic decision.</li>
            <li><b>Supporting documents</b> opens the return forms and completion letters without changing a request.</li>
            <li><b>Endorse / reject</b> records your decision. Endorsed requests move to the Administrative VP; rejected requests return to the College with your comment.</li>
            <li><b>Monitor requests</b> shows the history of requests this office has already handled.</li>
          </ul>
        </div>

        <section className="dash-grid">
          <DashboardPanel
            title="College-approved requests"
            subtitle="Review each student's eligibility and supporting documents, then endorse or reject with comments."
            action={<Link to="/academic-vp/eligibility">Open review queue →</Link>}
          >
            {loading ? (
              <p className="dash-loading">Loading requests…</p>
            ) : batches.length === 0 ? (
              <DashboardEmpty icon="🎉" title="No requests waiting">
                No College-approved requests are waiting for academic review right now.
              </DashboardEmpty>
            ) : (
              batches.map(b => (
                <article key={b._id} className="dash-batch">
                  <div className="dash-batch-head">
                    <div>
                      <h3>{b.batchName}</h3>
                      <p>{b.semester} · {b.academicYear}</p>
                    </div>
                    <StatusBadge status={b.status} />
                  </div>

                  <div className="dash-batch-meta">
                    <span><b>{b.studentCount ?? b.requests?.length ?? 0}</b> student(s)</span>
                    <span><b>{fmt(totalOf(b))}</b> ETB</span>
                    {b.forwardedBy?.name && (
                      <span><b>Forwarded by:</b> {b.forwardedBy.name} ({b.forwardedBy.role})</span>
                    )}
                  </div>

                  <StudentInfoTable
                    requests={b.requests}
                    showAmount
                    showDuration
                    showStatus
                    emptyText="No student requests are attached to this batch."
                  />

                  <div className="dash-batch-actions">
                    <Link className="btn primary" to="/academic-vp/eligibility">
                      Review academic eligibility →
                    </Link>
                    <Link className="btn secondary" to="/academic-vp/documents">
                      View supporting documents →
                    </Link>
                    <Link className="btn accent" to="/academic-vp/approved">
                      Endorse / Reject →
                    </Link>
                  </div>
                </article>
              ))
            )}
          </DashboardPanel>

          <div className="dash-side">
            <DashboardPanel title="Office functions" subtitle="The eight functions of the Academic VP Office.">
              <div className="dash-actions">
                {FUNCTIONS.map(f => (
                  <DashboardAction key={f.num} to={f.link} icon={f.icon} label={`${f.num}. ${f.text}`} />
                ))}
              </div>
            </DashboardPanel>

            <DashboardPanel title="Review summary" subtitle="Where the academic queue stands.">
              <div className="dash-summary-list">
                <div className="dash-summary-row"><span>Pending review</span><b>{fmt(pendingCount)}</b></div>
                <div className="dash-summary-row"><span>Students in review</span><b>{fmt(totalStudents)}</b></div>
                <div className="dash-summary-row"><span>Value in review</span><b className="money">{fmt(totalAmount)} ETB</b></div>
                <div className="dash-summary-row"><span>Total processed</span><b>{fmt(processedCount)}</b></div>
              </div>
            </DashboardPanel>

            <DashboardPanel title="Quick actions" subtitle="Jump straight to a task.">
              <div className="dash-actions">
                <DashboardAction to="/academic-vp/eligibility" icon="🎓" label="Review eligibility" />
                <DashboardAction to="/academic-vp/documents" icon="📄" label="Supporting documents" />
                <DashboardAction to="/academic-vp/approved" icon="✅" label="Endorse / reject" />
                <DashboardAction to="/academic-vp/history" icon="📋" label="Monitor requests" />
              </div>
            </DashboardPanel>
          </div>
        </section>
      </DashboardPage>
    </AcademicVPPortal>
  );
}
