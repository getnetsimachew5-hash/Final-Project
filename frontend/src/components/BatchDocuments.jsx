import { useEffect, useState } from 'react';
import api, { fileUrl } from '../api/axios';

// Shows each student's return form data + completion letter download link
// for one batch. Used by College / Academic VP / Admin VP document pages.
//
// view = 'full'    → return form + internship period + letter  (Student Documents)
// view = 'letters' → only students who uploaded a letter       (Completion Letters)
export default function BatchDocuments({ endpoint, view = 'full', data: preloaded = null }) {
  const [data, setData] = useState(preloaded);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(!preloaded);

  useEffect(() => {
    // Parent may already have fetched the documents (e.g. the Admin VP
    // requirements checklist) — reuse them instead of fetching twice.
    if (preloaded) {
      setData(preloaded);
      setErr('');
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    setErr('');
    api.get(endpoint)
      .then(r => { if (alive) setData(r.data); })
      .catch(e => { if (alive) setErr(e.response?.data?.message || 'Failed to load documents'); })
      .finally(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  }, [endpoint, preloaded]);

  if (loading) return <p>Loading documents…</p>;
  if (err) return <p className="error">{err}</p>;
  if (!data) return null;

  const lettersOnly = view === 'letters';
  const students = data.students ?? [];
  const rows = students
    .filter(r => r.student && r.student._id)
    .filter(r => (lettersOnly ? r.letterUrl : true));

  return (
    <div className="batch-card">
      <h3>
        {data.batch.batchName}{' '}
        <span className="muted">
          — {rows.length} {lettersOnly ? 'letter(s)' : 'student(s)'}
        </span>
      </h3>

      {rows.length === 0 ? (
        <p className="muted">
          {lettersOnly
            ? 'No completion letters uploaded for this batch yet.'
            : 'No students in this batch.'}
        </p>
      ) : (
        <table className="table">
          <thead>
            {lettersOnly ? (
              <tr><th>Student</th><th>Organization</th><th>Completion Letter</th></tr>
            ) : (
              <tr><th>Student</th><th>Organization</th><th>Internship Period</th><th>Completion Letter</th></tr>
            )}
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.student._id || row.student.institutionalId}>
                <td>{row.student.fullName}<br /><small className="muted">{row.student.institutionalId}</small></td>
                <td>
                  {row.returnForm
                    ? <>{row.returnForm.orgName}<br /><small className="muted">{row.returnForm.orgAddress}</small></>
                    : <span className="muted">No return form</span>}
                </td>
                {!lettersOnly && (
                  <td>
                    {row.returnForm?.startDate
                      ? row.returnForm.endDate
                        ? <>{new Date(row.returnForm.startDate).toLocaleDateString()} → {new Date(row.returnForm.endDate).toLocaleDateString()}</>
                        : <>{new Date(row.returnForm.startDate).toLocaleDateString()} → —</>
                      : '—'}
                  </td>
                )}
                <td>
                  {row.letterUrl
                    ? <a href={fileUrl(row.letterUrl)} target="_blank" rel="noreferrer">📄 View letter</a>
                    : <span className="muted">Missing</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
