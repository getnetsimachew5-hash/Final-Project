import { useEffect, useState } from 'react';
import api from '../../api/axios';
import FinancePortal from './FinancePortal';

export default function Approved() {
  const [batches, setBatches] = useState([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.get('/finance/batches')
      .then(r => {
        // /finance/batches returns { batches, pendingCount, totalPendingAmount }
        setBatches(r.data.batches || []);
      })
      .catch(e => setErr(e.response?.data?.message || 'Failed to load batches'));
  }, []);

  return (
    <FinancePortal>
      <h1>Approved Requests</h1>
      {err && <p className="error">{err}</p>}
      {batches.length === 0 && <p>No approved batches waiting for payment.</p>}
      {batches.map(b => (
        <div key={b._id} className="batch-card">
          <h3>{b.batchName}</h3>
          <p className="muted">
            {b.studentCount} students — total {b.totalAmount} ETB
          </p>
          <ul>
            {(b.requests || []).map(s => (
              <li key={s._id}>
                #{s.student?.institutionalId || '?'} — {s.student?.fullName || 'Unknown'}:{' '}
                <b>{s.amount} ETB</b> ({s.status})
              </li>
            ))}
          </ul>
        </div>
      ))}
    </FinancePortal>
  );
}