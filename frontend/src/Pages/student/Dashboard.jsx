import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import StudentPortal from './StudentPortal';
import StatusBadge from '../../components/StatusBadge';
import { useAuth } from '../../context/AuthContext';
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
const dateOnly = (value) => (value ? String(value).slice(0, 10) : '—');

const TODAY_LABEL = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export default function StudentDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState({ return: null, letter: null, paymentRequest: null });

  useEffect(() => {
    let active = true;
    api.get('/student/status')
      .then(r => { if (active) setData(r.data); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const ret = data.return;
  const letterUploaded = Boolean(data.letter);
  const profile = data.profile || user || {};
  const payment = data.paymentRequest;
  const paymentStatus = data.paymentStatus;
  const journey = data.journey || [];
  const reopen = data.reopenPermission || {};
  const paid = Boolean(data.paymentCompleted);
  const canUpdate = data.canUpdateInformation !== false;
  const registeredPhone = data.paymentPhone || profile.phone || '';
  const yearLabel = profile.year ? `Year ${profile.year}` : (profile.semester || '—');
  const currentJourneyIndex = journey.findIndex(
    (stage) => stage.state === 'current' || stage.state === 'rejected'
  );
  const progress = journey.length
    ? Math.round(((currentJourneyIndex < 0 ? journey.length - 1 : currentJourneyIndex) / (journey.length - 1)) * 100)
    : (ret ? (letterUploaded ? 60 : 40) : 10);

  const heroActions = [];
  if (!ret) heroActions.push({ to: '/student/return', label: 'Fill return form', icon: '📝', variant: 'light' });
  if (ret && !letterUploaded && !paid && canUpdate) {
    heroActions.push({ to: '/student/upload', label: 'Upload completion letter', icon: '📎', variant: 'light' });
  }
  if (canUpdate) heroActions.push({ to: '/student/profile', label: 'Update my information', icon: '✏️' });
  heroActions.push({ to: '/student/status', label: 'View status', icon: '📊' });

  return (
    <StudentPortal>
      <DashboardPage theme="student">
        <DashboardHero
          badge={`📅 ${TODAY_LABEL}`}
          title={`Welcome, ${user?.fullName || 'Student'} 👋`}
          description="Track your internship return form, completion letter, and TeleBirr payment in one place. Keep your registered phone number correct so your payment reaches you."
          actions={heroActions}
          snapshot={(
            <DashboardSnapshot
              label="Payment status"
              value={paid ? 'Paid' : ret ? 'In progress' : 'Not started'}
              meta={[
                `ID: ${profile.institutionalId || '—'}`,
                `Phone: ${registeredPhone || 'Missing'}`,
              ]}
              progress={progress}
              progressLabel="Internship payment progress"
              foot={[
                { label: 'return form', value: ret ? '✓' : '—' },
                { label: 'letter', value: letterUploaded ? '✓' : '—' },
                { label: 'payment', value: paid ? '✓' : '—' },
              ]}
            />
          )}
        />

        {reopen.allowed && (
          <div className="reopen-note">
            <strong>🔓 The CS Department opened an update window for you.</strong>{' '}
            You can correct your information and request another payment.
            {reopen.reason && <> Reason: <b>{reopen.reason}</b>.</>}
            <div className="reopen-note-actions">
              <Link className="btn small primary" to="/student/return">Update return form →</Link>
              <Link className="btn small secondary" to="/student/profile">Update my information →</Link>
            </div>
          </div>
        )}

        {paid && (
          <div className="paid-note">
            ✅ <strong>Payment complete.</strong> Your information is locked after payment.
            Contact the CS Department if a correction is needed.
          </div>
        )}

        <section className="dash-kpis" aria-label="My progress">
          <DashboardKpi
            icon="📝"
            label="Return form"
            value={ret ? 'Submitted' : 'Not submitted'}
            trend={ret ? 'received' : 'action needed'}
            sub={ret ? 'Your internship return form is on file' : 'Complete it to start the process'}
            color="#2563eb"
            to="/student/return"
          />
          <DashboardKpi
            icon="📎"
            label="Completion letter"
            value={letterUploaded ? 'Uploaded' : 'Not uploaded'}
            trend={letterUploaded ? 'received' : 'action needed'}
            sub="Internship completion letter"
            color="#7c3aed"
            to="/student/upload"
          />
          <DashboardKpi
            icon={paid ? '💸' : '⏳'}
            label="Payment"
            value={paid ? 'Paid' : ret ? 'In progress' : '—'}
            trend={payment ? `${fmt(payment.amount)} ETB` : 'pending'}
            sub="TeleBirr internship payment"
            color="#059669"
            to="/student/status"
          />
          <DashboardKpi
            icon="📱"
            label="Registered phone"
            value={registeredPhone || 'Missing'}
            trend={registeredPhone ? 'TeleBirr' : 'update'}
            sub="The phone number that receives your payment"
            color="#d97706"
            to="/student/profile"
          />
        </section>

        <section className="dash-grid">
          <div className="dash-side">
            <DashboardPanel
              title="My registered information"
              subtitle="Payments are sent to the phone number below."
              action={canUpdate ? <Link to="/student/profile">Update →</Link> : <span className="muted">Locked after payment</span>}
            >
              <div className="dash-summary-list">
                <div className="dash-summary-row"><span>Full name</span><b>{profile.fullName || '—'}</b></div>
                <div className="dash-summary-row"><span>University ID</span><b>{profile.institutionalId || '—'}</b></div>
                <div className="dash-summary-row"><span>Email</span><b>{profile.email || '—'}</b></div>
                <div className="dash-summary-row"><span>Registered TeleBirr phone</span><b>{registeredPhone || 'Missing — update your information'}</b></div>
                <div className="dash-summary-row"><span>Program</span><b>{profile.program || '—'}</b></div>
                <div className="dash-summary-row"><span>Year of study</span><b>{yearLabel}</b></div>
              </div>
            </DashboardPanel>

            <DashboardPanel
              title="Organization information"
              subtitle="Where you completed your internship."
              action={ret && canUpdate ? <Link to="/student/return">Edit →</Link> : null}
            >
              {ret ? (
                <div className="dash-summary-list">
                  <div className="dash-summary-row"><span>Organization</span><b>{ret.orgName || '—'}</b></div>
                  <div className="dash-summary-row"><span>Address</span><b>{ret.orgAddress || '—'}</b></div>
                  <div className="dash-summary-row"><span>Supervisor</span><b>{ret.supervisorName || '—'}</b></div>
                  <div className="dash-summary-row"><span>Supervisor phone</span><b>{ret.supervisorPhone || '—'}</b></div>
                  <div className="dash-summary-row"><span>Start date</span><b>{dateOnly(ret.startDate)}</b></div>
                  <div className="dash-summary-row"><span>End date</span><b>{dateOnly(ret.endDate)}</b></div>
                  <div className="dash-summary-row"><span>Status</span><b><StatusBadge status={ret.status} /></b></div>
                </div>
              ) : (
                <DashboardEmpty icon="📄" title="No return form yet">
                  Use the button above to submit your internship return form.
                </DashboardEmpty>
              )}
            </DashboardPanel>

            <DashboardPanel
              title="Where your information has reached"
              subtitle="Your journey through every office."
              action={<Link to="/student/status">Full timeline →</Link>}
            >
              {journey.length === 0 ? (
                <DashboardEmpty icon="🧭" title="Your journey starts here">
                  Submit your return form to begin the approval journey.
                </DashboardEmpty>
              ) : (
                <ol className="dash-journey-list">
                  {journey.map((stage, index) => (
                    <li key={stage.key} className={`dash-journey-step ${stage.state}`}>
                      <span className="dash-journey-dot" aria-hidden="true">
                        {stage.state === 'done' ? '✓' : stage.state === 'rejected' ? '!' : index + 1}
                      </span>
                      <div>
                        <strong>{stage.label}</strong>
                        <small>
                          {stage.previous ? 'Previous payment'
                            : stage.state === 'done' ? 'Completed'
                            : stage.state === 'current' ? (stage.key === 'paid' ? 'Paid' : 'In progress')
                            : stage.state === 'rejected' ? 'Needs correction'
                            : 'Waiting'}
                          {stage.at ? ` · ${new Date(stage.at).toLocaleDateString()}` : ''}
                        </small>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </DashboardPanel>
          </div>

          <div className="dash-side">
            <DashboardPanel title="Payment details" subtitle="Your TeleBirr internship payment.">
              {payment ? (
                <div className="dash-summary-list">
                  <div className="dash-summary-row"><span>Amount</span><b className="money">{fmt(payment.amount)} ETB</b></div>
                  <div className="dash-summary-row"><span>Payment phone</span><b>{data.paymentPhone || payment.studentPhone || registeredPhone || '—'}</b></div>
                  <div className="dash-summary-row"><span>Batch</span><b>{payment.batch?.batchName || '—'}</b></div>
                  <div className="dash-summary-row"><span>Payment status</span><b>{paymentStatus?.status || payment.status || '—'}</b></div>
                  {paymentStatus?.reference && (
                    <div className="dash-summary-row"><span>TeleBirr reference</span><b>{paymentStatus.reference}</b></div>
                  )}
                </div>
              ) : (
                <DashboardEmpty icon="💳" title="No payment request yet">
                  Your payment details will appear here once Finance receives your approved request.
                </DashboardEmpty>
              )}
              {paid && (
                <p className="success" style={{ marginBottom: 0 }}>
                  ✅ Payment completed. A payment notification has been added to your Messages &amp; Notifications page.
                </p>
              )}
            </DashboardPanel>

            <DashboardPanel title="Next steps" subtitle="Keep your submission moving.">
              <div className="dash-actions">
                {!ret && <DashboardAction to="/student/return" icon="📝" label="Fill return form" />}
                {ret && !letterUploaded && !paid && canUpdate && <DashboardAction to="/student/upload" icon="📎" label="Upload letter" />}
                {canUpdate && <DashboardAction to="/student/profile" icon="✏️" label="Update information" />}
                {reopen.allowed && <DashboardAction to="/student/return" icon="🔁" label="Update & resubmit" />}
                <DashboardAction to="/student/status" icon="📊" label="View status" />
                <DashboardAction to="/student/messages" icon="🔔" label="Messages" />
                <DashboardAction to="/student/history" icon="🕘" label="Payment history" />
              </div>
            </DashboardPanel>
          </div>
        </section>
      </DashboardPage>
    </StudentPortal>
  );
}
