import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import DepartmentPortal from './DepartmentPortal';

export default function Forward() {
  const [batches, setBatches] = useState([]);
  // One note PER BATCH — a single shared value would fill every textarea
  // on this page at once as soon as you type into any one of them.
  const [notes, setNotes] = useState({});
  const [error, setError] = useState('');
  const [forwardingId, setForwardingId] = useState(null);

  const setNote = (id, value) => setNotes(n => ({ ...n, [id]: value }));
  const noteFor = id => notes[id] || '';

  const load = () =>
    api.get('/department/batches')
      .then(r => setBatches(Array.isArray(r.data) ? r.data : []))
      .catch(e => setError(e.response?.data?.message || 'Failed to load batches'));
  useEffect(() => { load(); }, []);

  const forward = async (id, text) => {
    if (!text.trim()) {
      setError('A forwarding note is required for each batch.');
      return;
    }

    setForwardingId(id);
    setError('');
    try {
      await api.post(`/department/batches/${id}/forward`, { comment: text });
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Could not forward batch');
    } finally {
      setForwardingId(null);
    }
  };

  const drafts = batches.filter(b => b.status === 'draft');

  return (
    <DepartmentPortal>
      <h1>Forward to College</h1>
      <p>
        Draft batches ready to be reviewed by the College Office.
        Each batch needs a forwarding note — it is sent to College with the batch.
        After College, the batch continues to Academic VP, Admin VP, and then directly to
        Finance, so write a note that helps every office in the chain.
      </p>

      {error && <p className="error">{error}</p>}
      {drafts.length === 0 && <p className="empty">No draft batches to forward.</p>}

      {drafts.map(b => (
        <div key={b._id} className="batch-card">
          <div className="batch-card-head">
            <div>
              <h3>{b.batchName}</h3>
              <p className="muted">
                {b.students?.length || 0} students — {b.semester} {b.academicYear}
              </p>
            </div>
            <Link className="btn small" to={`/cs-dept/batch/${b._id}/edit`}>
              ✏️ Edit batch
            </Link>
          </div>
          <textarea
            className="note"
            placeholder="Forwarding note (required)"
            value={noteFor(b._id)}
            onChange={e => setNote(b._id, e.target.value)}
          />
          <button
            className="btn primary"
            onClick={() => forward(b._id, noteFor(b._id))}
            disabled={forwardingId === b._id || !noteFor(b._id).trim()}
          >
            {forwardingId === b._id ? 'Forwarding…' : 'Forward →'}
          </button>
        </div>
      ))}
    </DepartmentPortal>
  );
}
