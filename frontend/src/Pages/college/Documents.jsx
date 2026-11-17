import { useEffect, useState } from 'react';
import api from '../../api/axios';
import CollegePortal from './CollegePortal';
import BatchDocuments from '../../components/BatchDocuments';

export default function Documents() {
  const [batches, setBatches] = useState([]);
  useEffect(() => { api.get('/college/batches').then(r => setBatches(r.data)); }, []);

  return (
    <CollegePortal>
      <h1>Student Documents</h1>
      <p>Return forms and completion letters for every batch reaching your office.</p>
      {batches.length === 0 && <p>No batches yet.</p>}
      {batches.map(b => (
        <BatchDocuments key={b._id} endpoint={`/college/batches/${b._id}/documents`} />
      ))}
    </CollegePortal>
  );
}