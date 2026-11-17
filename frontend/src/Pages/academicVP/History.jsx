import { useEffect, useState } from 'react';
import api from '../../api/axios';
import AcademicVPPortal from './AcademicVPPortal';
import StatusBadge from '../../components/StatusBadge';

/**
 * Function 8 — Monitor processed requests.
 * Data: GET /academic-vp/history (batches this office endorsed, rejected, or
 * already forwarded onward), with the full audit trail per batch.
 */
export default function History() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/academic-vp/history')
      .then(r => setBatches(r.data.batches || []))
      .catch(e => setErr(e.response?.data?.message || 'Failed to load history'))
      .finally(() => setLoading(false));
  }, []);

  const ordered = [...batches].sort((a, z) => new Date(z.createdAt || 0) - new Date(a.createdAt || 0));

  return (
    <AcademicVPPortal>
      <h1>History</h1>
      <p className="muted"><strong>Function 8:</strong> Monitor processed requests — batches you endorsed, rejected, or forwarded onward.</p>

      {err && <p className="error">{err}</p>}
      {loading && <p className="muted">Loading…</p>}

      <table className="table">
        <thead><tr><th>Batch</th><th>Created</th><th>Status</th><th>Students</th><th>Trail</th></tr></thead>
        <tbody>
          {ordered.map(b => (
            <tr key={b._id}>
              <td>{b.batchName}<br /><small className="muted">{b.semester} {b.academicYear}</small></td>
              <td>{new Date(b.createdAt).toLocaleString()}</td>
              <td><StatusBadge status={b.status} /></td>
              <td>{(b.students||[]).length}</td>
              <td>
                <details><summary>View</summary>
                  <ol className="trail">
                    {(b.history||[]).sort((a,z)=>new Date(a.at||0)-new Date(z.at||0)).map((h,i)=>(
                      <li key={i}><b>{h.action}</b> — {(h.actor?.fullName||'system')} {h.comment ? `"${h.comment}"` : ''}<span className="step-when">{new Date(h.at).toLocaleString()}</span></li>
                    ))}
                  </ol>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AcademicVPPortal>
  );
}
