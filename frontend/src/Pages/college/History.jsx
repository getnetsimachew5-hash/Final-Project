import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import CollegePortal from './CollegePortal';
import StatusBadge from '../../components/StatusBadge';
import PaymentRequestStatus from '../../components/PaymentRequestStatus';

const fmtDT = (v) => (v ? new Date(v).toLocaleString() : '—');

export default function History() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get('/college/batches')
      .then(r => setBatches(r.data.batches || r.data || []))
      .catch(e => setErr(e.response?.data?.message || 'Failed to load history'))
      .finally(() => setLoading(false));
  }, []);

  const actorLabel = (h) => {
    if (!h.actor) return 'system';
    const name = h.actor.fullName || 'Unknown';
    const role = h.actor.role || '';
    return `${name} (${role})`;
  };

  // Newest first (most recent requests first)
  const ordered = [...batches].sort((a, z) => new Date(z.createdAt || 0) - new Date(a.createdAt || 0));

  const studentsOf = (b) =>
    b.requests?.length
      ? b.requests
      : (b.students || []).map(s => ({ student: s, status: '—' }));

  return (
    <CollegePortal>
      <h1>History</h1>
      <p className="muted">
        Monitor all batches, in order (newest first). Shows who forwarded the batch to the College,
        every student forwarded/handled with their current status, and the full action trail.
      </p>

      {err && <p className="error">{err}</p>}
      {loading && <p className="muted">Loading history…</p>}

      {!loading && ordered.length === 0 && <p className="muted">No previous requests yet.</p>}

      <table className="table">
        <thead>
          <tr>
            <th>Batch</th>
            <th>Created</th>
            <th>Status</th>
            <th>Forwarded by (CS Dept)</th>
            <th>Students</th>
            <th>Approved</th>
            <th>Student details</th>
            <th>Actions (trail)</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map(b => {
            const fwd = b.forwardedBy;
            const acts = (b.history || []).slice().sort((a, z) => new Date(a.at || 0) - new Date(z.at || 0));
            const students = studentsOf(b);

            return (
              <tr key={b._id}>
                <td>
                  {b.batchName}<br />
                  <small className="muted">{b.semester} · {b.academicYear}</small>
                </td>
                <td>{new Date(b.createdAt).toLocaleDateString()}<br /><small className="muted">{new Date(b.createdAt).toLocaleTimeString()}</small></td>
                <td><StatusBadge status={b.status} /></td>
                <td>
                  {fwd
                    ? <>{fwd.name}<br /><small className="muted">{fwd.role}<br />{fmtDT(fwd.at)}</small></>
                    : <span className="muted">—</span>}
                </td>
                <td>{b.studentDecisions?.total ?? students.length}</td>
                <td>{b.studentDecisions?.approved ?? 0}</td>
                <td style={{ minWidth: '280px' }}>
                  <details>
                    <summary>View all forwarded students ({students.length})</summary>
                    <ul style={{ margin: '0.4rem 0 0 1rem', padding: 0, listStyle: 'none' }}>
                      {students.length === 0 ? (
                        <li className="muted">No student records</li>
                      ) : (
                        students.map((r, idx) => (
                          <li key={r.student?._id || idx} style={{ marginBottom: '0.35rem' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
                              <b>{r.student?.fullName || '—'}</b>
                              <small className="muted">{r.student?.institutionalId}</small>
                              <PaymentRequestStatus status={r.status} />
                              {r.amount != null && <span className="chip">{Number(r.amount).toLocaleString()} ETB</span>}
                            </div>
                            <div className="muted" style={{ fontSize: '0.78rem' }}>
                              {r.student?.program || '—'} · {r.student?.year ? `Year ${r.student.year}` : '—'} · 📞 {r.student?.phone || '—'} · ✉️ {r.student?.email || '—'}
                            </div>
                            {r.missingInfo?.length > 0 && (
                              <div style={{ fontSize: '0.76rem', color: '#9a3412' }}>Missing: {r.missingInfo.join(', ')}</div>
                            )}
                          </li>
                        ))
                      )}
                    </ul>
                  </details>
                </td>
                <td style={{ minWidth: '240px' }}>
                  <details>
                    <summary>View trail (full &amp; in order)</summary>
                    <ol className="trail">
                      {acts.length === 0 ? (
                        <li>No actions recorded yet.</li>
                      ) : (
                        acts.map((h, i) => (
                          <li key={i}>
                            <b>{h.action}</b> — {actorLabel(h)}
                            {h.comment && <> “{h.comment}”</>}
                            <span className="step-when">{fmtDT(h.at || Date.now())}</span>
                          </li>
                        ))
                      )}
                    </ol>
                  </details>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p style={{ marginTop: '1rem' }}>
        <Link to="/college/pending" className="btn secondary">Go to Review &amp; Approve →</Link>
      </p>
    </CollegePortal>
  );
}
