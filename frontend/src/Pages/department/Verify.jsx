import { useEffect, useState } from 'react';
import api from '../../api/axios';
import DepartmentPortal from './DepartmentPortal';

export default function Verify() {
  const [returns, setReturns] = useState([]);
  const [letters, setLetters] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = () =>
    api.get('/department/submissions')
      .then(r => { setReturns(r.data.returns); setLetters(r.data.letters); })
      .catch(e => setError(e.response?.data?.message || 'Failed to load students'));

  useEffect(() => { load(); }, []);

  const hasLetter = id => letters.some(l => String(l.return) === String(id));
  const missingFor = r => r.missingInfo || [];

  // The API returns the same checklist the student sees, so this page can
  // explain exactly why a record cannot be verified yet.
  const canVerify = r => hasLetter(r._id) && missingFor(r).length === 0;

  const setVerified = async (id, verified) => {
    setBusy(id);
    setError('');
    try {
      await api.post(`/department/returns/${id}/${verified ? 'unverify' : 'verify'}`);
      await load();
    } catch (e) {
      const data = e.response?.data || {};
      const list = (data.missingInfo || []).join(', ');
      setError(`${data.message || 'Action failed'}${list ? ` Missing: ${list}.` : ''}`);
    } finally {
      setBusy('');
    }
  };

  const incomplete = returns.filter(r => missingFor(r).length > 0).length;

  return (
    <DepartmentPortal>
      <h1>Verify Students</h1>
      <p>
        Confirm that each student has submitted the required internship return documents
        and a completion letter. The system checks every record automatically — only
        students with <b>no missing information</b> can be verified and added to a
        payment batch.
      </p>

      {error && <p className="error">{error}</p>}

      {incomplete > 0 && (
        <p className="warn-banner">
          ⚠️ {incomplete} student(s) still have missing information. Use
          <b> Student Information → Ask to Correct</b> so they can fix it before you verify.
        </p>
      )}

      {returns.length === 0 && <p className="empty">No submissions to verify yet.</p>}

      <table className="table">
        <thead>
          <tr>
            <th>Student</th><th>ID</th><th>Organization</th>
            <th>Missing Information</th>
            <th>Letter</th><th>Verified</th><th>Action</th>
          </tr>
        </thead>
        <tbody>
          {returns.map(r => {
            const missing = missingFor(r);
            const blocked = !canVerify(r);

            return (
              <tr key={r._id} className={missing.length ? 'needs-fix' : ''}>
                <td>{r.student?.fullName}</td>
                <td>{r.student?.institutionalId}</td>
                <td>{r.orgName}</td>
                <td className="cell-missing">
                  {missing.length > 0 ? (
                    <ul className="missing-list">
                      {missing.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                  ) : (
                    <span className="ok-chip">✅ Complete</span>
                  )}
                </td>
                <td>{hasLetter(r._id) ? '✅ Uploaded' : '❌ Missing'}</td>
                <td>{r.verified ? '✅ Verified' : '⏳ Pending'}</td>
                <td>
                  <button
                    className={`btn ${r.verified ? 'danger' : 'primary'}`}
                    disabled={busy === r._id || (!r.verified && blocked)}
                    title={!r.verified && blocked
                      ? `Fix first: ${missing.join(', ') || 'completion letter'}`
                      : undefined}
                    onClick={() => setVerified(r._id, r.verified)}
                  >
                    {busy === r._id ? '...' : r.verified ? 'Unverify' : 'Verify'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </DepartmentPortal>
  );
}
