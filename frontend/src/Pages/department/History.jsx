import { useEffect, useState } from 'react';
import api from '../../api/axios';
import DepartmentPortal from './DepartmentPortal';
import StatusBadge from '../../components/StatusBadge';

export default function History() {
  const [batches, setBatches] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/department/history')
      .then(r => setBatches(Array.isArray(r.data) ? r.data : []))
      .catch(e => setError(e.response?.data?.message || 'Failed to load history'));
  }, []);

  return (
    <DepartmentPortal>
      <h1>History</h1>
      <p>Every batch with its full approval / rejection trail.</p>

      {error && <p className="error">{error}</p>}
      {batches.length === 0 && <p className="empty">No batch history yet.</p>}

      {batches.map(b => (
        <div key={b._id} className="batch-card">
          <h3>{b.batchName} — <StatusBadge status={b.status} /></h3>
          <p>
            {b.batchCode && <><b>{b.batchCode}</b> — </>}
            {b.students?.length || 0} students — {b.batchMonth ? `${b.batchMonth} · ` : ''}{b.semester} {b.academicYear} —
            created {new Date(b.createdAt).toLocaleDateString()}
          </p>
          <ul>
            {(b.history || []).map((h, i) => (
              <li key={i}>
                <b>{h.action}</b> by {h.actor?.fullName || 'system'}
                {h.comment ? ` — ${h.comment}` : ''}
                {' '}({new Date(h.at).toLocaleString()})
              </li>
            ))}
            {(b.history || []).length === 0 && <li>No actions recorded yet.</li>}
          </ul>
        </div>
      ))}
    </DepartmentPortal>
  );
}
