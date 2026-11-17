import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import DepartmentPortal from './DepartmentPortal';
import StatusBadge from '../../components/StatusBadge';

export default function Requests() {
  const [batches, setBatches] = useState([]);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');

  const load = () =>
    Promise.all([
      api.get('/department/batches').then(r => setBatches(Array.isArray(r.data) ? r.data : [])),
      api.get('/department/requests').then(r => setRequests(Array.isArray(r.data) ? r.data : [])),
    ]).catch(e => setError(e.response?.data?.message || 'Failed to load requests'));

  useEffect(() => { load(); }, []);

  const cancel = async (id) => {
    if (!window.confirm('Cancel this request?')) return;
    try {
      await api.post(`/department/batches/${id}/cancel`);
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to cancel');
    }
  };

  const reject = async (id) => {
    const comment = window.prompt('Reason for rejecting this request (required):');
    if (comment === null) return;
    if (!comment.trim()) return setError('A rejection reason is required.');
    try {
      await api.post(`/department/batches/${id}/reject`, { comment });
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to reject');
    }
  };

  const total = b => requests
    .filter(q => String(q.batch?._id || q.batch) === String(b._id))
    .reduce((sum, q) => sum + (q.amount || 0), 0);

  return (
    <DepartmentPortal>
      <h1>Payment Request List</h1>

      {error && <p className="error">{error}</p>}

      <h3>Batches</h3>
      {batches.length === 0 && <p className="empty">No batches yet — create one on the Payment Batch page.</p>}
      <table className="table">
        <thead>
          <tr><th>Batch</th><th>Code</th><th>Month</th><th>Semester</th><th>Students</th><th>Amount (ETB)</th>
              <th>Status</th><th>Action</th></tr>
        </thead>
        <tbody>
          {batches.map(b => (
            <tr key={b._id}>
              <td className="cell-name">{b.batchName}</td>
              <td><span className="cred">{b.batchCode || '—'}</span></td>
              <td>{b.batchMonth || '—'}</td>
              <td>{b.semester} {b.academicYear}</td>
              <td>{b.students?.length || 0}</td>
              <td><b>{total(b).toLocaleString()}</b></td>
              <td><StatusBadge status={b.status} /></td>
              <td>
                {b.status === 'draft' && (
                  <div className="row-actions">
                    <Link className="btn small" to={`/cs-dept/batch/${b._id}/edit`}>✏️ Edit</Link>
                    <button className="btn small danger" onClick={() => reject(b._id)}>Reject</button>
                    <button className="btn small" onClick={() => cancel(b._id)}>Cancel</button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Individual Payment Requests</h3>
      {requests.length === 0 && <p className="empty">No payment requests yet.</p>}
      <table className="table">
        <thead>
          <tr><th>Student</th><th>ID</th><th>TeleBirr Phone</th><th>Program</th><th>Year of Study</th>
              <th>Batch</th><th>Daily Rate</th><th>Days</th><th>Balance (ETB)</th><th>Status</th></tr>
        </thead>
        <tbody>
          {requests.map(q => (
            <tr key={q._id}>
              <td className="cell-name">
                {q.student?.fullName || '—'}
                {q.student?.email && <><br /><small className="muted">{q.student.email}</small></>}
              </td>
              <td>{q.student?.institutionalId || '—'}</td>
              <td>{q.student?.phone || <span className="muted">missing</span>}</td>
              <td>{q.student?.program || '—'}</td>
              <td>{q.student?.year ? `Year ${q.student.year}` : (q.student?.semester || '—')}</td>
              <td>{q.batch?.batchName}
                {q.batch?.batchCode && <><br /><small className="muted">{q.batch.batchCode}</small></>}
              </td>
              <td>{q.dailyRate ?? 100} ETB</td>
              <td>{q.durationDays}</td>
              <td><b>{Number(q.amount || 0).toLocaleString()}</b></td>
              <td><StatusBadge status={q.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </DepartmentPortal>
  );
}
