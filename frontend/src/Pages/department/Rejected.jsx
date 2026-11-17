import { useEffect, useState } from 'react';
import api from '../../api/axios';
import DepartmentPortal from './DepartmentPortal';

export default function Rejected() {
  const [batches, setBatches] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/department/batches')
      .then(r => setBatches(Array.isArray(r.data) ? r.data : []))
      .catch(e => setError(e.response?.data?.message || 'Failed to load rejected requests'));
  }, []);

  const rejected = batches.filter(b => b.status === 'rejected');

  return (
    <DepartmentPortal>
      <h1>Rejected / Cancelled Requests</h1>

      {error && <p className="error">{error}</p>}
      {rejected.length === 0 && <p className="empty">No rejected requests.</p>}

      {rejected.length > 0 && (
      <table className="table">
        <thead>
          <tr><th>Batch</th><th>Students</th><th>Reason</th><th>Date</th></tr>
        </thead>
        <tbody>
          {rejected.map(b => (
            <tr key={b._id}>
              <td className="cell-name">{b.batchName}</td>
              <td>{b.students?.length || 0}</td>
              <td className="blocked-reason">{b.rejectionReason || '—'}</td>
              <td>{new Date(b.updatedAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </DepartmentPortal>
  );
}
