import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../api/axios';
import DepartmentPortal from './DepartmentPortal';
import StatusBadge from '../../components/StatusBadge';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/* ------------------------------------------------------------------ *
 * Edit a DRAFT payment batch  →  "Edit if Necessary" in the flow
 *   Login → View Submissions → Verify → Create Batch →
 *   Create Payment Request → **Edit if Necessary** → Forward to College
 *
 * Only a draft can be edited (the API enforces that too). Saving
 * rebuilds the batch's payment requests so the amounts always match
 * the current student list.
 * ------------------------------------------------------------------ */
export default function EditBatch() {
  const { id } = useParams();
  const nav = useNavigate();

  const [batch, setBatch] = useState(null);
  const [returns, setReturns] = useState([]);
  const [letters, setLetters] = useState([]);
  const [form, setForm] = useState({ batchName: '', semester: 'First', academicYear: '', batchMonth: '', studentIds: [] });
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    Promise.all([api.get(`/department/batches/${id}`), api.get('/department/submissions')])
      .then(([b, s]) => {
        const data = b.data;
        setBatch(data);
        setForm({
          batchName: data.batchName || '',
          semester: data.semester || 'First',
          academicYear: data.academicYear || '',
          batchMonth: data.batchMonth || '',
          studentIds: (data.students || []).map(x => String(x._id || x)),
        });
        setReturns(s.data.returns);
        setLetters(s.data.letters);
      })
      .catch(e => {
        if (e.response?.status === 404) setNotFound(true);
        else setError(e.response?.data?.message || 'Failed to load the batch');
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Same eligibility rule as the Create Batch page: verified submission +
  // registered TeleBirr phone + completion letter.
  const hasLetter = useCallback(
    r => letters.some(l => String(l.return) === String(r._id)),
    [letters],
  );
  const canBatch = useCallback(
    r => Boolean(
      r.verified &&
      r.student?._id &&
      r.student.phone &&
      hasLetter(r) &&
      !(r.missingInfo || []).length
    ),
    [hasLetter],
  );

  // Students already in THIS draft batch stay selectable; students in another
  // active batch, or already paid, are excluded.
  const belongsToThisBatch = useCallback(
    r => String(r.batchInfo?.batchId || '') === String(id),
    [id],
  );

  const toRow = useCallback(
    r => ({
      id: String(r.student?._id),
      name: r.student?.fullName || '(no student)',
      idNo: r.student?.institutionalId || '—',
      email: r.student?.email || '',
      phone: r.student?.phone,
      program: r.student?.program || '—',
      semester: r.student?.year ? `Year ${r.student.year}` : (r.student?.semester || '—'),
      username: r.student?.username,
      org: r.orgName,
      days: r.durationDays || 0,
      dailyRate: r.dailyRate ?? 0,
      balance: r.balance ?? 0,
      paymentStatus: r.paymentStatus || 'not_batched',
      batchInfo: r.batchInfo || null,
      previousBatch: r.previousBatch || null,
      inThisBatch: belongsToThisBatch(r),
    }),
    [belongsToThisBatch],
  );

  const selectable = useMemo(
    () =>
      returns
        .filter(r => canBatch(r) && (!r.alreadyBatched || belongsToThisBatch(r)))
        .map(toRow),
    [returns, canBatch, belongsToThisBatch, toRow],
  );

  // 💰 Already paid elsewhere — never selectable again.
  const paidStudents = useMemo(
    () => returns
      .filter(r => r.paymentStatus === 'paid' && !belongsToThisBatch(r))
      .map(toRow),
    [returns, belongsToThisBatch, toRow],
  );

  // ⏳ Already in another active batch.
  const pendingStudents = useMemo(
    () => returns
      .filter(r => r.paymentStatus === 'pending' && !belongsToThisBatch(r))
      .map(toRow),
    [returns, belongsToThisBatch, toRow],
  );

  // Students that cannot be part of any batch (missing information).
  const blocked = useMemo(
    () =>
      returns
        .filter(r => !r.alreadyBatched && !canBatch(r))
        .map(r => ({
          name: r.student?.fullName || '(no student)',
          idNo: r.student?.institutionalId || '—',
          phone: r.student?.phone,
          semester: r.student?.year ? `Year ${r.student.year}` : (r.student?.semester || '—'),
          reason: (r.missingInfo || []).length
            ? `Missing: ${r.missingInfo.join(', ')}`
            : !r.student?._id
              ? 'Student account is missing'
              : r.status === 'rejected'
                ? `Waiting for corrected information: ${r.rejectionReason}`
                : !r.verified
                  ? 'Documents not verified yet — verify on the Verify Students page'
                  : !hasLetter(r)
                    ? 'Completion letter not uploaded yet'
                    : 'Cannot be batched yet',
        })),
    [returns, canBatch, hasLetter],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return selectable;
    return selectable.filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        s.idNo.toLowerCase().includes(q) ||
        String(s.org || '').toLowerCase().includes(q),
    );
  }, [selectable, search]);

  const selectedIds = useMemo(() => new Set(form.studentIds.map(String)), [form.studentIds]);
  const isSelected = useCallback(id => selectedIds.has(String(id)), [selectedIds]);
  const readOnly = !batch || batch.status !== 'draft';

  const toggle = useCallback(
    id =>
      setForm(f => ({
        ...f,
        studentIds: isSelected(id)
          ? f.studentIds.filter(x => String(x) !== String(id))
          : [...f.studentIds, id],
      })),
    [isSelected],
  );

  const selectAllVisible = () => {
    const toAdd = filtered.filter(s => !isSelected(s.id)).map(s => s.id);
    setForm(f => ({ ...f, studentIds: [...new Set([...f.studentIds, ...toAdd])] }));
  };

  const clearSelection = () => setForm(f => ({ ...f, studentIds: [] }));

  /* Live totals — the system always calculates the balance itself. */
  const selectedSessions = selectable.filter(s => selectedIds.has(s.id));
  const totalStudents = selectedSessions.length;
  const totalDays = selectedSessions.reduce((n, s) => n + s.days, 0);
  const totalBalance = selectedSessions.reduce((n, s) => n + s.balance, 0);
  const shownRate = selectedSessions[0]?.dailyRate || 100;

  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    setError('');
    if (form.studentIds.length === 0) {
      setError('Select at least one verified student');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/department/batches/${id}`, form);
      setMsg('Batch updated ✅');
      setTimeout(() => nav('/cs-dept/requests'), 600);
    } catch (err) {
      setError(err.response?.data?.message || 'Error updating batch');
      setSaving(false);
    }
  };

  return (
    <DepartmentPortal>
      <div className="page-toolbar">
        <div>
          <h1>Edit Payment Batch</h1>
          <p className="muted">Change the batch details or add / remove students before it is forwarded.</p>
        </div>
        <Link className="btn" to="/cs-dept/requests">← Back to list</Link>
      </div>

      {loading && <p className="muted">Loading batch…</p>}

      {!loading && notFound && (
        <p className="empty">Batch not found. <Link to="/cs-dept/requests">Go back to the list.</Link></p>
      )}

      {!loading && !notFound && error && <p className="error">{error}</p>}

      {!loading && !notFound && batch && readOnly && (
        <p className="warn-banner">
          ⛔ This batch is <b>{batch.status}</b> and can no longer be edited — only <b>draft</b> batches can be edited.
        </p>
      )}

      {!loading && !notFound && batch && (
        <div className="cards">
          <div className="card"><h3>Selectable Students</h3><p>{selectable.length}</p></div>
          <div className="card"><h3>Already Paid (excluded)</h3><p>{paidStudents.length}</p></div>
          <div className="card"><h3>Pending in Another Batch</h3><p>{pendingStudents.length}</p></div>
        </div>
      )}

      {!loading && !notFound && batch && (
        <form className="form-grid" onSubmit={save}>
          <input
            placeholder="Batch Name"
            value={form.batchName}
            onChange={e => setForm({ ...form, batchName: e.target.value })}
            disabled={readOnly}
            required
          />
          <select
            value={form.batchMonth || ''}
            onChange={e => setForm({ ...form, batchMonth: e.target.value })}
            disabled={readOnly}
            title="Month the batch is created for"
          >
            <option value="">No month (legacy batch)</option>
            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={form.semester}
            onChange={e => setForm({ ...form, semester: e.target.value })}
            disabled={readOnly}
          >
            <option>First</option>
            <option>Second</option>
          </select>
          <input
            placeholder="Academic Year"
            value={form.academicYear}
            onChange={e => setForm({ ...form, academicYear: e.target.value })}
            disabled={readOnly}
          />
          <p className="muted" style={{ gridColumn: '1 / -1' }}>
            Batch code: <b>{batch.batchCode || '— (generated when saved)'}</b> · month:{' '}
            <b>{form.batchMonth || '—'}</b> · {form.semester} · {form.academicYear || '—'}.
            Duplicate names are allowed in different months or academic years.
          </p>

          <div className="batch-tools">
            <input
              className="search"
              placeholder="Search by name, ID or organization"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button type="button" className="btn small" onClick={selectAllVisible}
              disabled={readOnly || filtered.length === 0}>
              Select visible ({filtered.length})
            </button>
            <button type="button" className="btn small danger" onClick={clearSelection}
              disabled={readOnly || form.studentIds.length === 0}>
              Clear selection
            </button>
            <span className="batch-count">{form.studentIds.length} selected</span>
          </div>

          {filtered.length === 0 && <p className="empty">No verified students match your search.</p>}

          <table className="table">
            <thead>
              <tr>
                <th>Select</th>
                <th>Student</th>
                <th>ID</th>
                <th>TeleBirr Phone</th>
                <th>Program</th>
                <th>Year of Study</th>
                <th>Username</th>
                <th>Days</th>
                <th>Daily Rate</th>
                <th>Balance (ETB)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} className={isSelected(s.id) ? 'selected' : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      checked={isSelected(s.id)}
                      disabled={readOnly}
                      onChange={() => toggle(s.id)}
                    />
                  </td>
                  <td className="cell-name">
                    {s.name}
                    {s.email && <><br /><small className="muted">{s.email}</small></>}
                    {s.inThisBatch && (
                      <>
                        <br />
                        <small className="muted">In this batch</small>
                      </>
                    )}
                    {s.previousBatch && !s.inThisBatch && (
                      <>
                        <br />
                        <small className="muted">
                          Previous request rejected
                          {s.previousBatch?.batchName ? ` in ${s.previousBatch.batchName}` : ''}
                          {' '}— available again
                        </small>
                      </>
                    )}
                  </td>
                  <td className="cell-id">{s.idNo}</td>
                  <td>{s.phone || '—'}</td>
                  <td>{s.program}</td>
                  <td>{s.semester}</td>
                  <td><span className="cred">{s.username || '—'}</span></td>
                  <td>{s.days}</td>
                  <td>{s.dailyRate} ETB</td>
                  <td><b>{s.balance.toLocaleString()}</b></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="subtotal-row">
                <td colSpan={3}>Total selected</td>
                <td colSpan={5}>
                  {totalStudents} student(s) — {totalDays} day(s) total — rate {shownRate} ETB
                </td>
                <td>Balance</td>
                <td>{totalBalance.toLocaleString()} ETB</td>
              </tr>
            </tfoot>
          </table>

          {paidStudents.length > 0 && (
            <>
              <h3 className="section-title">💰 Already paid — cannot be selected again</h3>
              <p className="muted">
                These students have already received their payment through SIPMS.
                A student is paid only once.
              </p>
              <table className="table">
                <thead>
                  <tr><th>Student</th><th>ID</th><th>Batch</th><th>Month / Semester</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {paidStudents.map(s => (
                    <tr key={s.id} className="blocked-row">
                      <td className="cell-name">{s.name}</td>
                      <td className="cell-id">{s.idNo}</td>
                      <td>
                        {s.batchInfo?.batchName || '—'}
                        {s.batchInfo?.batchCode && <><br /><small className="muted">{s.batchInfo.batchCode}</small></>}
                      </td>
                      <td>
                        {[s.batchInfo?.batchMonth, s.batchInfo?.semester, s.batchInfo?.academicYear]
                          .filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td><span className="ok-chip">💰 Paid</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {pendingStudents.length > 0 && (
            <>
              <h3 className="section-title">⏳ Pending in another batch — excluded</h3>
              <p className="muted">
                These students are already inside another active batch. They become
                available again only if that batch is rejected or cancelled.
              </p>
              <table className="table">
                <thead>
                  <tr><th>Student</th><th>ID</th><th>Batch</th><th>Month / Semester</th><th>Current stage</th></tr>
                </thead>
                <tbody>
                  {pendingStudents.map(s => (
                    <tr key={s.id} className="blocked-row">
                      <td className="cell-name">{s.name}</td>
                      <td className="cell-id">{s.idNo}</td>
                      <td>
                        {s.batchInfo?.batchName || '—'}
                        {s.batchInfo?.batchCode && <><br /><small className="muted">{s.batchInfo.batchCode}</small></>}
                      </td>
                      <td>
                        {[s.batchInfo?.batchMonth, s.batchInfo?.semester, s.batchInfo?.academicYear]
                          .filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td>
                        <StatusBadge status={s.batchInfo?.status} />
                        {s.batchInfo?.requestStatus === 'rejected' && (
                          <><br /><StatusBadge status="rejected" /></>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {blocked.length > 0 && (
            <>
              <h3 className="section-title">⛔ Students NOT available (missing / incorrect information)</h3>
              <p className="muted">
                These students cannot be added to a batch. Send them a message
                (Student Information page → “Ask to Correct”) so they resubmit correct information.
              </p>
              <table className="table">
                <thead>
                  <tr><th>Student</th><th>ID</th><th>Phone</th><th>Year of Study</th><th>What is missing</th></tr>
                </thead>
                <tbody>
                  {blocked.map((b, i) => (
                    <tr key={i} className="blocked-row">
                      <td>{b.name}</td>
                      <td className="cell-id">{b.idNo}</td>
                      <td>{b.phone || <span className="muted">missing</span>}</td>
                      <td>{b.semester}</td>
                      <td className="blocked-reason">{b.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div className="form-actions">
            <button className="btn primary" type="submit" disabled={readOnly || saving}>
              {saving ? 'Saving…' : `Save changes (${form.studentIds.length} selected)`}
            </button>
            <button className="btn" type="button" onClick={() => nav('/cs-dept/requests')} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {msg && <p className="success">{msg}</p>}
    </DepartmentPortal>
  );
}
