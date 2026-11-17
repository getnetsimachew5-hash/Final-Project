import { useEffect, useState, useMemo, useCallback } from 'react';
import api from '../../api/axios';
import DepartmentPortal from './DepartmentPortal';
import StatusBadge from '../../components/StatusBadge';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const currentMonth = MONTHS[new Date().getMonth()];

const EMPTY = {
  batchName: '',
  semester: 'First',
  academicYear: '2025/26',
  batchMonth: currentMonth,
  studentIds: [],
};

export default function CreateBatch() {
  const [returns, setReturns] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [letters, setLetters] = useState([]);

  const load = () =>
    api.get('/department/submissions').then(r => {
      setReturns(r.data.returns);
      setLetters(r.data.letters);
    });
  useEffect(() => { load(); }, []);

  // A student can be batched only when the submission is verified, the account
  // has a registered TeleBirr phone, and the completion letter is present.
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
      !(r.missingInfo || []).length &&
      !(r.paymentReopenAllowed && !r.paymentReopenRequestedAt)
    ),
    [hasLetter],
  );

  const toRow = useCallback(
    r => ({
      id: r.student?._id,
      name: r.student?.fullName || '(no student)',
      idNo: r.student?.institutionalId || '—',
      email: r.student?.email || '',
      phone: r.student?.phone,
      program: r.student?.program || '—',
      semester: r.student?.year ? `Year ${r.student.year}` : (r.student?.semester || '—'),
      username: r.student?.username,
      org: r.orgName,
      returnId: r._id,
      days: r.durationDays || 0,
      dailyRate: r.dailyRate ?? 0,
      balance: r.balance ?? 0,
      paymentStatus: r.paymentStatus || 'not_batched',
      batchInfo: r.batchInfo || null,
      previousBatch: r.previousBatch || null,
    }),
    [],
  );

  // ✅ Available: verified + complete + never batched (or the previous batch
  // was rejected/cancelled). Students in any active batch are excluded.
  const selectable = useMemo(
    () => returns.filter(r => canBatch(r) && !r.alreadyBatched).map(toRow),
    [returns, canBatch, toRow],
  );

  // 💰 Already paid — never selectable again ("one student, one payment").
  const paidStudents = useMemo(
    () => returns.filter(r => r.paymentStatus === 'paid').map(toRow),
    [returns, toRow],
  );

  // ⏳ Already in another batch that is still in the approval pipeline.
  const pendingStudents = useMemo(
    () => returns.filter(r => r.paymentStatus === 'pending').map(toRow),
    [returns, toRow],
  );

  // ⛔ Not batched, but information is missing so they cannot be selected.
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
              : r.paymentReopenAllowed && !r.paymentReopenRequestedAt
                ? 'Post-paid update window open — waiting for the student to resubmit corrected information'
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

  const selectedIds = useMemo(
    () => new Set(form.studentIds.map(String)),
    [form.studentIds],
  );

  const isSelected = useCallback(
    id => selectedIds.has(String(id)),
    [selectedIds],
  );

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
    setForm(f => ({
      ...f,
      studentIds: [...new Set([...f.studentIds, ...toAdd])],
    }));
  };

  const clearSelection = () => setForm(f => ({ ...f, studentIds: [] }));

  {/* Totals for the selected students — the system calculates the balance.
      Always 100 ETB per day today; the rate is shown per student. */}
  const selectedSessions = selectable.filter(s => selectedIds.has(String(s.id)));
  const totalStudents = selectedSessions.length;
  const totalDays = selectedSessions.reduce((n, s) => n + s.days, 0);
  const totalBalance = selectedSessions.reduce((n, s) => n + s.balance, 0);
  const shownRate = selectedSessions[0]?.dailyRate || 100;

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    setError('');
    if (form.studentIds.length === 0) {
      setError('Select at least one verified student');
      return;
    }
    try {
      await api.post('/department/batches', form);
      setMsg('Batch created ✅');
      setForm(EMPTY);
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Error creating batch');
    }
  };

  return (
    <DepartmentPortal>
      <h1>Create Payment Batch</h1>
      <p>
        Only <b>verified</b> students with a <b>registered TeleBirr phone</b> and a
        completion letter can be selected. The registered number is the number
        Finance will pay. A student can be paid <b>only once</b>, so students who
        are already paid or already inside another batch are shown separately and
        cannot be selected again.
      </p>

      <div className="cards">
        <div className="card"><h3>Available to Batch</h3><p>{selectable.length}</p></div>
        <div className="card"><h3>Already Paid (excluded)</h3><p>{paidStudents.length}</p></div>
        <div className="card"><h3>Pending in a Batch (excluded)</h3><p>{pendingStudents.length}</p></div>
      </div>

      <form className="form-grid" onSubmit={submit}>
        <input
          placeholder="Batch Name (e.g. Batch_2025_3rdYear)"
          value={form.batchName}
          onChange={e => setForm({ ...form, batchName: e.target.value })}
          required
        />
        <select
          value={form.batchMonth}
          onChange={e => setForm({ ...form, batchMonth: e.target.value })}
          title="Month the batch is created for"
        >
          {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={form.semester}
          onChange={e => setForm({ ...form, semester: e.target.value })}
        >
          <option>First</option>
          <option>Second</option>
        </select>
        <input
          placeholder="Academic Year"
          value={form.academicYear}
          onChange={e => setForm({ ...form, academicYear: e.target.value })}
        />
        <p className="muted" style={{ gridColumn: '1 / -1' }}>
          Batch identity: <b>{form.batchName.trim() || '(name)'}</b> · <b>{form.batchMonth}</b> ·{' '}
          {form.semester} · {form.academicYear || '(year)'}.
          The same name is allowed in a different month or academic year — a unique
          batch code is generated automatically to tell them apart.
        </p>

        <div className="batch-tools">
          <input
            className="search"
            placeholder="Search by name, ID or organization"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button
            type="button"
            className="btn small"
            onClick={selectAllVisible}
            disabled={filtered.length === 0}
          >
            Select visible ({filtered.length})
          </button>
          <button
            type="button"
            className="btn small danger"
            onClick={clearSelection}
            disabled={form.studentIds.length === 0}
          >
            Clear selection
          </button>
          <span className="batch-count">
            {form.studentIds.length} selected
          </span>
        </div>

        {filtered.length === 0 && (
          <p className="empty">No verified students match your search.</p>
        )}

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
                    onChange={() => toggle(s.id)}
                  />
                </td>
                <td className="cell-name">
                  {s.name}
                  {s.email && <><br /><small className="muted">{s.email}</small></>}
                  {s.previousBatch && (
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

        {/* 💰 Already paid — one student is paid only once */}
        {paidStudents.length > 0 && (
          <>
            <h3 className="section-title">💰 Already paid — cannot be selected again</h3>
            <p className="muted">
              These students have already received their internship payment through
              SIPMS. A student is paid only once, so they are not available for a new
              batch.
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

        {/* ⏳ Already in another batch but not paid yet */}
        {pendingStudents.length > 0 && (
          <>
            <h3 className="section-title">⏳ Pending in another batch — excluded</h3>
            <p className="muted">
              These students are already inside a batch that is still moving through
              the approval chain. They become available again only if that batch is
              rejected or cancelled.
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

        {/* Students with missing information — excluded from the batch */}
        {blocked.length > 0 && (
          <>
            <h3 className="section-title">⛔ Students NOT added (missing / incorrect information)</h3>
            <p className="muted">
              These students cannot be added to the batch. Send them a message
              (Student Information page → “Ask to Correct”) so they resubmit
              correct information.
            </p>
            <table className="table">
              <thead>
                <tr><th>Student</th><th>ID</th><th>Phone</th><th>Year of Study</th><th>What is missing</th></tr>
              </thead>
              <tbody>
                {blocked.map((b, i) => (
                  <tr key={i} className="blocked-row">
                    <td className="cell-name">{b.name}</td>
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

        <button
          className="btn primary"
          type="submit"
          disabled={form.studentIds.length === 0}
        >
          Create Batch ({form.studentIds.length} selected)
        </button>
      </form>

      {msg && <p className="success">{msg}</p>}
      {error && <p className="error">{error}</p>}
    </DepartmentPortal>
  );
}
