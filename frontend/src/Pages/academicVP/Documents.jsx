import { useEffect, useState } from 'react';
import api from '../../api/axios';
import AcademicVPPortal from './AcademicVPPortal';
import BatchDocuments from '../../components/BatchDocuments';

/**
 * Function 4 — Check supporting documents (return forms + completion letters).
 * Data: GET /academic-vp/batches/:id/documents, rendered by the shared
 * BatchDocuments component (shared with the College and Finance views).
 */
export default function Documents() {
  const [batches, setBatches] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/academic-vp/batches')
      .then(r => setBatches(r.data.batches || []))
      .catch(e => setErr(e.response?.data?.message || 'Failed to load batches'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AcademicVPPortal>
      <h1>Supporting Documents</h1>
      <p className="muted"><strong>Function 3:</strong> Review supporting documents (return forms + completion letters).</p>

      {err && <p className="error">{err}</p>}
      {loading && <p>Loading batches…</p>}

      {!loading && !err && (
        <>
          {batches.length === 0 && <p className="muted">No batches to review.</p>}
          {batches.map(b => (
            <BatchDocuments key={b._id} endpoint={`/academic-vp/batches/${b._id}/documents`} />
          ))}
        </>
      )}
    </AcademicVPPortal>
  );
}
