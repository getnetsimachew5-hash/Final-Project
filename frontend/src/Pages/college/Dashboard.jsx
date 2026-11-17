import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import CollegePortal from './CollegePortal';
import StatusBadge from '../../components/StatusBadge';
import PaymentRequestStatus from '../../components/PaymentRequestStatus';
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

const TODAY_LABEL = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

/**
 * ============================================
 * COLLEGE DASHBOARD
 * ============================================
 * Function 1 — see every request the CS Department forwarded to this office
 * Function 7 — see, in order, what already moved further down the pipeline
 *
 * Everything shown here comes from GET /api/college/batches, which also
 * returns `forwardedBy` (who handed the batch over and when) and `requests`
 * (one entry per student, ordered by name).
 */
export default function Dashboard() {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    return api.get('/college/batches')
      .then(r => setBatches(r.data.batches || r.data || []))
      .catch(e => setErr(
        e.response?.data?.message ||
        'Failed to load the requests coming from the CS Department.',
      ))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const waiting   = batches.filter(b => b.status === 'pending_college');
  const inFlight  = batches.filter(b => ['pending_academic_vp', 'pending_admin_vp', 'pending_finance'].includes(b.status));
  const paidB     = batches.filter(b => b.status === 'paid');
  const rejectedB = batches.filter(b => b.status === 'rejected');
  const previous  = batches.filter(b => b.status !== 'pending_college');

  const studentsWaiting = waiting.reduce((s, b) => s + (b.requests?.length || b.students?.length || 0), 0);
  const totalAmount     = batches.reduce((s, b) => s + (b.studentDecisions?.totalAmount || 0), 0);
  const paidStudents    = batches.reduce((s, b) => s + (b.studentDecisions?.paid || 0), 0);
  const totalStudents   = batches.reduce(
    (s, b) => s + (b.studentDecisions?.total ?? b.requests?.length ?? b.students?.length ?? 0),
    0,
  );
  const missingStudents = waiting.reduce(
    (s, b) => s + (b.requests || []).filter(r => (r.missingInfo || []).length > 0).length,
    0,
  );
  const paidPercent = totalStudents ? Math.round((paidStudents / totalStudents) * 100) : 0;

  const countOf = (b, status) => (b.requests || []).filter(r => r.status === status).length;
  const displayName = user?.fullName || 'Officer';

  return (
    <CollegePortal>
      <DashboardPage theme="college">
        <DashboardHero
          badge={`📅 ${TODAY_LABEL}`}
          title={`Welcome back, ${displayName}`}
          description="Review the requests the CS Department forwarded to this office, approve or reject each student with comments, and forward approved students to the Academic Vice President Office."
          actions={[
            { to: '/college/pending', label: 'Review & approve', icon: '✅', variant: 'light' },
            { to: '/college/documents', label: 'Student documents', icon: '📁' },
            { to: '/college/forward', label: 'Forward to Academic VP', icon: '📤' },
          ]}
          snapshot={(
            <DashboardSnapshot
              label="Review queue"
              value={`${studentsWaiting} student${studentsWaiting === 1 ? '' : 's'}`}
              meta={[
                `${waiting.length} batch${waiting.length === 1 ? '' : 'es'}`,
                `${fmt(totalAmount)} ETB requested`,
              ]}
              progress={paidPercent}
              progressLabel="Students already paid"
              foot={[
                { label: 'waiting', value: studentsWaiting },
                { label: 'paid', value: paidStudents },
                { label: 'complete', value: `${paidPercent}%` },
              ]}
            />
          )}
        />

        {err && <p className="error">{err}</p>}
        {loading && <p className="dash-loading">Loading requests…</p>}

        <section className="dash-kpis" aria-label="Key statistics">
          <DashboardKpi
            icon="📥"
            label="Waiting from CS"
            value={fmt(waiting.length)}
            trend={`${studentsWaiting} students`}
            sub="Batches received from the CS Department"
            color="#7c3aed"
            to="/college/pending"
          />
          <DashboardKpi
            icon="🚚"
            label="Onward in pipeline"
            value={fmt(inFlight.length)}
            trend="in progress"
            sub="Academic VP → Admin VP → Finance"
            color="#2563eb"
            to="/college/history"
          />
          <DashboardKpi
            icon="✅"
            label="Completed here"
            value={fmt(paidB.length)}
            trend={`${paidStudents} paid`}
            sub="Batches completed at this office"
            color="#059669"
            to="/college/history"
          />
          <DashboardKpi
            icon="💰"
            label="Total requested"
            value={<>{fmt(totalAmount)} <small>ETB</small></>}
            trend={`${batches.length} batches`}
            sub="Across all batches"
            color="#d97706"
          />
        </section>

        <section className="dash-grid">
          <DashboardPanel
            title="Received from the CS Department"
            subtitle="Review each student's documents, then approve or reject with comments."
            action={<Link to="/college/pending">Open review queue →</Link>}
          >
            {loading ? (
              <p className="dash-loading">Loading requests…</p>
            ) : waiting.length === 0 ? (
              <DashboardEmpty icon="🎉" title="No pending requests">
                Nothing is waiting from the CS Department right now.
              </DashboardEmpty>
            ) : (
              waiting.map(b => {
                const students = (b.requests?.length ? b.requests : (b.students || []).map(s => ({
                  student: s,
                  status: 'pending_college',
                })));
                const approvedCount = countOf(b, 'college_approved');
                const rejectedCount = countOf(b, 'rejected');
                const undecided     = countOf(b, 'pending_college');

                return (
                  <article key={b._id} className="dash-batch">
                    <div className="dash-batch-head">
                      <div>
                        <h3>{b.batchName}</h3>
                        <p>{b.semester} · {b.academicYear}</p>
                      </div>
                      <StatusBadge status={b.status} />
                    </div>

                    <div className="dash-batch-meta">
                      {b.forwardedBy ? (
                        <>
                          <span><b>Forwarded by:</b> {b.forwardedBy.name} ({b.forwardedBy.role})</span>
                          {b.forwardedBy.at && <span>{new Date(b.forwardedBy.at).toLocaleString()}</span>}
                          {b.forwardedBy.comment && <span>note: “{b.forwardedBy.comment}”</span>}
                        </>
                      ) : (
                        <span><b>Origin:</b> CS Department (no forwarding note recorded)</span>
                      )}
                    </div>

                    <div className="dash-batch-meta">
                      <span><b>{students.length}</b> student(s)</span>
                      <span className="dash-chip ok">approved {approvedCount}</span>
                      <span className="dash-chip bad">rejected {rejectedCount}</span>
                      <span className="dash-chip">not decided {undecided}</span>
                    </div>

                    <ul className="dash-student-list">
                      {students.map(r => {
                        const missing = Array.isArray(r.missingInfo) ? r.missingInfo : [];
                        return (
                          <li key={r.student?._id || r._id} className="dash-student-item">
                            <div className="dash-student-line">
                              <strong>{r.student?.fullName || '—'}</strong>
                              <small>{r.student?.institutionalId || '—'}</small>
                              <small>
                                {r.student?.program || '—'} · {r.student?.year ? `Year ${r.student.year}` : '—'}
                              </small>
                              <small>📞 {r.student?.phone || '—'} · ✉️ {r.student?.email || '—'}</small>
                              {r.amount != null && <span className="dash-chip">{fmt(r.amount)} ETB</span>}
                              <PaymentRequestStatus status={r.status} />
                            </div>
                            {missing.length > 0 && (
                              <div className="dash-missing">
                                <strong>Missing:</strong> {missing.join(', ')}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>

                    <div className="dash-batch-actions">
                      <Link className="btn primary" to="/college/pending">
                        Review &amp; approve students individually →
                      </Link>
                      <Link className="btn secondary" to="/college/documents">
                        View documents &amp; letters
                      </Link>
                      <Link className="btn secondary" to="/college/forward">
                        Forward approved students to Academic VP
                      </Link>
                    </div>
                  </article>
                );
              })
            )}
          </DashboardPanel>

          <div className="dash-side">
            <DashboardPanel title="Pipeline summary" subtitle="Where the batches stand right now.">
              <div className="dash-summary-list">
                <div className="dash-summary-row"><span>Waiting from CS</span><b>{fmt(waiting.length)}</b></div>
                <div className="dash-summary-row"><span>Students waiting</span><b>{fmt(studentsWaiting)}</b></div>
                <div className="dash-summary-row"><span>Onward in pipeline</span><b>{fmt(inFlight.length)}</b></div>
                <div className="dash-summary-row"><span>Completed here</span><b>{fmt(paidB.length)}</b></div>
                <div className="dash-summary-row"><span>Rejected here</span><b>{fmt(rejectedB.length)}</b></div>
                <div className="dash-summary-row"><span>Total requested</span><b className="money">{fmt(totalAmount)} ETB</b></div>
              </div>
            </DashboardPanel>

            <DashboardPanel title="Needs attention" subtitle="Keep the review queue moving.">
              <div className="dash-attention">
                <DashboardAttention
                  to="/college/pending"
                  icon="📥"
                  title="Students to review"
                  subtitle="Waiting for a decision"
                  count={studentsWaiting}
                />
                <DashboardAttention
                  to="/college/pending"
                  icon="⚠️"
                  title="Incomplete records"
                  subtitle="Missing student information"
                  count={missingStudents}
                />
                <DashboardAttention
                  to="/college/history"
                  icon="🚚"
                  title="Batches in pipeline"
                  subtitle="Already forwarded onward"
                  count={inFlight.length}
                />
              </div>
            </DashboardPanel>

            <DashboardPanel title="Quick actions" subtitle="Jump straight to a task.">
              <div className="dash-actions">
                <DashboardAction to="/college/pending" icon="✅" label="Review & approve" />
                <DashboardAction to="/college/documents" icon="📁" label="Student documents" />
                <DashboardAction to="/college/forward" icon="📤" label="Forward to AVP" />
              </div>
            </DashboardPanel>
          </div>
        </section>

        <DashboardPanel
          title="Previous requests (in order)"
          subtitle="Everything that has moved past this office."
          flush
        >
          {previous.length === 0 ? (
            <DashboardEmpty icon="🕘" title="Nothing has moved yet">
              Requests will appear here once they leave this office.
            </DashboardEmpty>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Batch</th>
                    <th>Status</th>
                    <th>Forwarded by</th>
                    <th>Students</th>
                    <th>Approved</th>
                    <th>Paid</th>
                    <th>All forwarded students</th>
                  </tr>
                </thead>
                <tbody>
                  {previous.map((b, i) => {
                    const students = (b.requests?.length ? b.requests : (b.students || []).map(s => ({ student: s })));
                    return (
                      <tr key={b._id}>
                        <td data-label="#">{i + 1}</td>
                        <td data-label="Batch">
                          {b.batchName}
                          <br />
                          <small className="muted">{b.semester} · {b.academicYear}</small>
                        </td>
                        <td data-label="Status"><StatusBadge status={b.status} /></td>
                        <td data-label="Forwarded by">
                          {b.forwardedBy
                            ? <>{b.forwardedBy.name}<br /><small className="muted">{b.forwardedBy.role}</small></>
                            : <span className="muted">—</span>}
                        </td>
                        <td data-label="Students">{b.studentDecisions?.total ?? students.length}</td>
                        <td data-label="Approved">{b.studentDecisions?.approved ?? 0}</td>
                        <td data-label="Paid">{b.studentDecisions?.paid ?? 0}</td>
                        <td data-label="All forwarded students" style={{ minWidth: '260px' }}>
                          <details>
                            <summary>View all forwarded students ({students.length})</summary>
                            <ul style={{ margin: '0.4rem 0 0 1rem', padding: 0, listStyle: 'none' }}>
                              {students.map((r, idx) => (
                                <li key={r.student?._id || idx} style={{ marginBottom: '0.3rem' }}>
                                  <b>{r.student?.fullName || '—'}</b> <small className="muted">{r.student?.institutionalId}</small>
                                  <div className="muted" style={{ fontSize: '0.78rem' }}>
                                    {r.student?.program || '—'} · {r.student?.year ? `Year ${r.student.year}` : '—'} · 📞 {r.student?.phone || '—'} · ✉️ {r.student?.email || '—'} · <PaymentRequestStatus status={r.status} />
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DashboardPanel>

        {rejectedB.length > 0 && (
          <DashboardPanel title="Rejected at this office" subtitle="Requests that did not pass the College review.">
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {rejectedB.map(b => (
                <li key={b._id} style={{ marginBottom: '0.4rem' }}>
                  {b.batchName} — <StatusBadge status={b.status} />
                  {b.rejectionReason && <span className="muted"> — {b.rejectionReason}</span>}
                </li>
              ))}
            </ul>
          </DashboardPanel>
        )}
      </DashboardPage>
    </CollegePortal>
  );
}
