import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import AdminVPPortal from './AdminVPPortal';
import StatusBadge from '../../components/StatusBadge';

const money = (n) => (Number(n) || 0).toLocaleString();
const apiError = (e, fallback) =>
  e.response?.data?.errors?.[0]?.msg || e.response?.data?.message || fallback;

const ROLE_LABEL = {
  cs_dept: 'CS Department',
  college: 'College Office',
  academic_vp: 'Academic VP',
  admin_vp: 'Admin VP',
  industrial: 'Former staff',
  finance: 'Finance',
};

// FUNCTION 7 (standalone page) — approval history for every request this office
// acted on, including batches already forwarded to Finance.
export default function History() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/admin-vp/history')
      .then((r) => setBatches(r.data.batches || []))
      .catch((e) => setErr(apiError(e, 'Failed to load history')))
      .finally(() => setLoading(false));
  }, []);

  const ordered = [...batches].sort(
    (a, z) => new Date(z.updatedAt || z.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
  );

  return (
    <AdminVPPortal>
      <h1>Approval History</h1>
      <p className="muted">
        What this office confirmed, approved/rejected, and forwarded — with the
        Academic VP hand-off and the next actor's actions in the trail. Use the
        guided workflow on the dashboard to process a request.
      </p>

      {err && <p className="error">{err}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && ordered.length === 0 && (
        <p className="muted">No authorization history yet.</p>
      )}

      <div className="vp-table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Batch</th>
              <th>Status</th>
              <th>Students</th>
              <th>Decision</th>
              <th>Authorized</th>
              <th>Updated</th>
              <th>Trail</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((b) => (
              <tr key={b._id}>
                <td>
                  {b.batchName}
                  <br /><small className="muted">{b.semester} {b.academicYear}</small>
                </td>
                <td><StatusBadge status={b.status} /></td>
                <td>{(b.students || []).length}</td>
                <td>
                  {b.adminVpDecision
                    ? <span className={`badge ${b.adminVpDecision === 'approved' ? 'green' : 'red'}`}>
                        {b.adminVpDecision}
                      </span>
                    : <span className="muted">pending</span>}
                </td>
                <td>
                  {b.authorizedAmount ? `${money(b.authorizedAmount)} ETB` : <span className="muted">—</span>}
                </td>
                <td>{b.updatedAt ? new Date(b.updatedAt).toLocaleString() : '—'}</td>
                <td>
                  <details>
                    <summary>View</summary>
                    <ol className="trail">
                      {[...(b.history || [])]
                        .sort((a, z) => new Date(a.at || 0) - new Date(z.at || 0))
                        .map((h, i) => (
                          <li key={i}>
                            <b>{h.action}</b>
                            {' — '}
                            {h.actor?.fullName || 'system'}
                            {h.actor?.role ? ` (${ROLE_LABEL[h.actor.role] || h.actor.role})` : ''}
                            {h.comment ? ` “${h.comment}”` : ''}
                            {h.at && <span className="step-when">{new Date(h.at).toLocaleString()}</span>}
                          </li>
                        ))}
                    </ol>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="batch-actions">
        <Link className="btn primary" to="/admin-vp">Open guided workflow →</Link>
      </div>
    </AdminVPPortal>
  );
}
