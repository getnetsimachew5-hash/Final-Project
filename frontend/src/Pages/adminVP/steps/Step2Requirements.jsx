import { useEffect, useMemo, useState } from 'react';
import api from '../../../api/axios';
import BatchDocuments from '../../../components/BatchDocuments';

const money = (n) => (Number(n) || 0).toLocaleString();
const apiError = (e, fallback) =>
  e.response?.data?.errors?.[0]?.msg || e.response?.data?.message || fallback;

// FUNCTION 2 — Review administrative requirements.
// Combines the batch/request data from the Academic VP hand-off with the
// supporting documents uploaded earlier by the student / College Office.
export default function Step2Requirements({ batch, acknowledged, onAcknowledge }) {
  const [docs, setDocs] = useState(null);
  const [docsError, setDocsError] = useState('');
  const [loadingDocs, setLoadingDocs] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoadingDocs(true);
    setDocs(null);
    setDocsError('');

    api.get(`/admin-vp/batches/${batch._id}/documents`)
      .then((r) => { if (alive) setDocs(r.data); })
      .catch((e) => { if (alive) setDocsError(apiError(e, 'Failed to load supporting documents')); })
      .finally(() => { if (alive) setLoadingDocs(false); });

    return () => { alive = false; };
  }, [batch._id]);

  const checks = useMemo(() => {
    const requests = batch.requests || [];
    const students = docs?.students || [];
    const withForms = students.filter((s) => s.returnForm).length;
    const withLetters = students.filter((s) => s.letterUrl).length;

    return [
      {
        key: 'endorsement',
        label: 'Academic VP endorsement recorded',
        ok: (batch.history || []).some((h) => h.action === 'endorsed'),
        detail: 'Received from the Academic VP Office',
        hard: true,
      },
      {
        key: 'requests',
        label: 'Student payment requests attached',
        ok: requests.length > 0,
        detail: `${requests.length} request(s)`,
        hard: true,
      },
      {
        key: 'amounts',
        label: 'Every request has a payment amount',
        ok: requests.length > 0 && requests.every((r) => Number(r.amount) > 0),
        detail: `Total ${money(batch.totalAmount)} ETB`,
        hard: true,
      },
      {
        key: 'forms',
        label: 'Internship return forms available',
        ok: !loadingDocs && students.length > 0 && withForms === students.length,
        detail: loadingDocs ? 'Checking…' : `${withForms}/${students.length} student(s)`,
        hard: false,
      },
      {
        key: 'letters',
        label: 'Completion letters attached',
        ok: !loadingDocs && withLetters > 0,
        detail: loadingDocs ? 'Checking…' : `${withLetters}/${students.length} student(s)`,
        hard: false,
      },
    ];
  }, [batch, docs, loadingDocs]);

  const hardFailures = checks.filter((c) => c.hard && !c.ok).length;

  return (
    <>
      <div className="vp-panel-head">
        <h2>2. Review administrative requirements</h2>
        <p className="muted">
          Batch <b>{batch.batchName}</b> · {batch.semester} {batch.academicYear} ·{' '}
          {batch.studentCount ?? (batch.students || []).length} student(s)
        </p>
      </div>

      <div className="vp-summary-grid">
        <div className="vp-summary"><span>Students</span><b>{batch.studentCount ?? (batch.students || []).length}</b></div>
        <div className="vp-summary"><span>Requested</span><b>{money(batch.totalAmount)} ETB</b></div>
        <div className="vp-summary"><span>Requests</span><b>{(batch.requests || []).length}</b></div>
      </div>

      <h3>Administrative checklist</h3>
      <ul className="vp-checks">
        {checks.map((c) => (
          <li key={c.key} className={c.ok ? 'ok' : c.hard ? 'fail' : 'warn'}>
            <span className="vp-check-mark" aria-hidden="true">{c.ok ? '✓' : '!'}</span>
            <span className="vp-check-text">
              <b>{c.label}</b>
              <small className="muted">{c.detail}</small>
            </span>
          </li>
        ))}
      </ul>

      {hardFailures > 0 && (
        <p className="error">
          {hardFailures} required item(s) are missing. Resolve them before confirming payment,
          or reject the request in step 4 and return it for correction.
        </p>
      )}

      <h3>Student amounts</h3>
      <div className="vp-table-wrap">
        <table className="table">
          <thead>
            <tr><th>Student</th><th>Program</th><th>Year</th><th>Phone</th><th>Email</th><th>Amount</th><th>Request status</th></tr>
          </thead>
          <tbody>
            {(batch.requests || []).map((r) => (
              <tr key={r._id}>
                <td>
                  {r.student?.fullName || '—'}
                  <br /><small className="muted">{r.student?.institutionalId}</small>
                </td>
                <td>{r.student?.program || '—'}</td>
                <td>{r.student?.year ? `Year ${r.student.year}` : '—'}</td>
                <td>{r.student?.phone || '—'}</td>
                <td>{r.student?.email || '—'}</td>
                <td>{money(r.amount)} ETB</td>
                <td><small className="muted">{r.status}</small></td>
              </tr>
            ))}
            {(batch.requests || []).length === 0 && (
              <tr><td colSpan="7" className="muted">No payment requests attached to this batch.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h3>Supporting documents</h3>
      {loadingDocs && <p className="muted">Loading return forms and completion letters…</p>}
      {docsError && <p className="error">{docsError}</p>}
      {docs && (
        <BatchDocuments
          endpoint={`/admin-vp/batches/${batch._id}/documents`}
          data={docs}
        />
      )}

      <label className="vp-ack">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => onAcknowledge(e.target.checked)}
        />
        <span>
          I have reviewed the administrative requirements, student amounts, and supporting
          documents for this batch.
        </span>
      </label>

      <p className="muted">
        Hand-off: on approval this batch will go directly to the <b>Finance Office</b>,
        which will process the TeleBirr payments for the students.
      </p>
    </>
  );
}
