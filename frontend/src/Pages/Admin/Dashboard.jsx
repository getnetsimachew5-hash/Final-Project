import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import AdminPortal from './AdminPortal';
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

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const loadStats = async () => {
    setLoading(true);
    setErrMsg('');
    try {
      const r = await api.get('/admin/stats');
      setStats(r.data);
    } catch (e) {
      setErrMsg('Could not load system statistics. ' + (e.response?.data?.message || e.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  const backup = async () => {
    setMsg('');
    try {
      const resp = await api.get('/admin/backup', { responseType: 'blob' });
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sipms-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg('✅ Backup downloaded and recorded in the audit log.');
    } catch (e) {
      setMsg('❌ Backup failed: ' + (e.response?.data?.message || e.message));
    }
  };

  const totalUsers = stats?.users?.total ?? 0;
  const activeUsers = stats?.users?.active ?? 0;
  const pendingUsers = stats?.users?.pending ?? 0;
  const activePercent = totalUsers ? Math.round((activeUsers / totalUsers) * 100) : 0;
  const displayName = user?.fullName || 'Administrator';
  const roleRows = [
    { label: 'Students', value: stats?.users?.byRole?.student, icon: '🎓' },
    { label: 'CS Department', value: stats?.users?.byRole?.cs_dept, icon: '💻' },
    { label: 'College Office', value: stats?.users?.byRole?.college, icon: '🏫' },
    { label: 'Academic VP', value: stats?.users?.byRole?.academic_vp, icon: '🎖️' },
    { label: 'Administrative VP', value: stats?.users?.byRole?.admin_vp, icon: '⚖️' },
    { label: 'Finance Office', value: stats?.users?.byRole?.finance, icon: '💳' },
  ];

  return (
    <AdminPortal>
      <DashboardPage theme="admin">
        <DashboardHero
          badge={`📅 ${TODAY_LABEL}`}
          title={`Welcome back, ${displayName}`}
          description="Monitor user accounts, internship batches, TeleBirr payments, and system activity. Approve registrations, review the audit trail, and export a full database backup."
          actions={[
            { to: '/admin/users', label: 'Manage users', icon: '👥', variant: 'light' },
            { to: '/admin/logs', label: 'Audit logs', icon: '🧾' },
            { to: '/admin/messages', label: 'Messages', icon: '💬' },
          ]}
          actionSlot={(
            <>
              <button type="button" className="dash-btn ghost" onClick={loadStats} disabled={loading}>
                🔄 Refresh
              </button>
              <button type="button" className="dash-btn light" onClick={backup}>
                ⬇️ Backup database
              </button>
            </>
          )}
          snapshot={(
            <DashboardSnapshot
              label="System snapshot"
              value={`${fmt(totalUsers)} user${totalUsers === 1 ? '' : 's'}`}
              meta={[
                `${fmt(activeUsers)} active`,
                `${fmt(pendingUsers)} pending approval`,
                `${fmt(stats?.batches?.total ?? 0)} batches`,
              ]}
              progress={activePercent}
              progressLabel="Active accounts"
              foot={[
                { label: 'users', value: fmt(totalUsers) },
                { label: 'batches', value: fmt(stats?.batches?.total ?? 0) },
                { label: 'paid', value: fmt(stats?.batches?.paid ?? 0) },
              ]}
            />
          )}
        />

        {msg && <p className="success">{msg}</p>}
        {errMsg && <p className="error">{errMsg}</p>}
        {loading && <p className="dash-loading">Loading system statistics…</p>}

        <section className="dash-kpis" aria-label="System statistics">
          <DashboardKpi
            icon="👤"
            label="Total users"
            value={fmt(totalUsers)}
            trend={`${fmt(activeUsers)} active`}
            sub="All registered accounts"
            color="#2563eb"
            to="/admin/users"
          />
          <DashboardKpi
            icon="✅"
            label="Active accounts"
            value={fmt(activeUsers)}
            trend={`${activePercent}%`}
            sub="Approved and able to sign in"
            color="#059669"
            to="/admin/users"
          />
          <DashboardKpi
            icon="⏳"
            label="Pending approvals"
            value={fmt(pendingUsers)}
            trend={pendingUsers > 0 ? 'action needed' : 'clear'}
            sub="Registrations waiting for review"
            color="#d97706"
            to="/admin/users"
          />
          <DashboardKpi
            icon="📦"
            label="Total batches"
            value={fmt(stats?.batches?.total ?? 0)}
            trend={`${fmt(stats?.batches?.paid ?? 0)} paid`}
            sub="Internship payment batches"
            color="#7c3aed"
          />
        </section>

        <section className="dash-grid">
          <DashboardPanel
            title="User statistics"
            subtitle="Accounts by role across the system."
            action={<Link to="/admin/users">Manage users →</Link>}
          >
            <div className="dash-summary-list">
              <div className="dash-summary-row"><span>👥 Total users</span><b>{fmt(totalUsers)}</b></div>
              <div className="dash-summary-row"><span>✅ Active accounts</span><b>{fmt(activeUsers)}</b></div>
              <div className="dash-summary-row"><span>⏳ Pending approvals</span><b>{fmt(pendingUsers)}</b></div>
              {roleRows.map(row => (
                <div key={row.label} className="dash-summary-row">
                  <span>{row.icon} {row.label}</span>
                  <b>{fmt(row.value)}</b>
                </div>
              ))}
            </div>
          </DashboardPanel>

          <div className="dash-side">
            <DashboardPanel title="Batches & payments" subtitle="Pipeline health at a glance.">
              <div className="dash-summary-list">
                <div className="dash-summary-row"><span>Total batches</span><b>{fmt(stats?.batches?.total ?? 0)}</b></div>
                <div className="dash-summary-row"><span>Draft batches</span><b>{fmt(stats?.batches?.draft ?? 0)}</b></div>
                <div className="dash-summary-row"><span>In progress</span><b>{fmt(stats?.batches?.pending ?? 0)}</b></div>
                <div className="dash-summary-row"><span>Paid batches</span><b>{fmt(stats?.batches?.paid ?? 0)}</b></div>
                <div className="dash-summary-row"><span>Rejected batches</span><b>{fmt(stats?.batches?.rejected ?? 0)}</b></div>
                <div className="dash-summary-row"><span>Organizations</span><b>{fmt(stats?.organizations ?? 0)}</b></div>
              </div>
            </DashboardPanel>

            <DashboardPanel title="System tools" subtitle="Administration shortcuts.">
              <div className="dash-actions">
                <DashboardAction to="/admin/users" icon="👥" label="Users & approvals" />
                <DashboardAction to="/admin/logs" icon="🧾" label="Audit logs" />
                <DashboardAction to="/admin/messages" icon="💬" label="Messages" />
                <DashboardAction to="/admin" icon="📊" label="Refresh dashboard" />
              </div>
              <div className="dash-batch-actions">
                <button type="button" className="btn secondary" onClick={loadStats} disabled={loading}>
                  🔄 Refresh statistics
                </button>
                <button type="button" className="btn primary" onClick={backup}>
                  ⬇️ Backup database
                </button>
              </div>
            </DashboardPanel>
          </div>
        </section>

        <DashboardPanel title="Payments processed" subtitle="TeleBirr payment totals across the system.">
          {stats ? (
            <div className="dash-summary-list">
              <div className="dash-summary-row"><span>Payments processed</span><b>{fmt(stats.payments?.total ?? 0)}</b></div>
              <div className="dash-summary-row"><span>Today's payments</span><b>{fmt(stats.payments?.today ?? 0)}</b></div>
              <div className="dash-summary-row"><span>Total amount paid</span><b className="money">{fmt(stats.payments?.totalAmount ?? 0)} ETB</b></div>
              <div className="dash-summary-row"><span>Today's amount paid</span><b className="money">{fmt(stats.payments?.todayAmount ?? 0)} ETB</b></div>
            </div>
          ) : (
            <DashboardEmpty icon="💳" title="No payment statistics">
              Payment totals will appear after the first successful TeleBirr payment.
            </DashboardEmpty>
          )}
        </DashboardPanel>
      </DashboardPage>
    </AdminPortal>
  );
}
