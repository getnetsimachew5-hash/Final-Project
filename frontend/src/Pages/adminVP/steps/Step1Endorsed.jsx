import StatusBadge from '../../../components/StatusBadge';

const money = (n) => (Number(n) || 0).toLocaleString();

const studentsOf = (batch) => (
  (batch.requests || []).map((request) => request.student).filter(Boolean).length
    ? (batch.requests || []).map((request) => request.student).filter(Boolean)
    : (batch.students || [])
);

function RequestCard({ batch, selected, onSelect, completed = false }) {
  const students = studentsOf(batch);
  const decision = batch.adminVpDecision;
  const total = Number(batch.totalAmount)
    || (batch.requests || []).reduce((sum, request) => sum + (Number(request.amount) || 0), 0);

  return (
    <article className={`vp-batch-select${selected ? ' selected' : ''}${completed ? ' completed' : ''}`}>
      <header className="batch-head">
        <h3>{batch.batchName}</h3>
        <StatusBadge status={batch.status} />
      </header>

      <p className="muted vp-batch-meta">
        {batch.semester} · {batch.academicYear} · {batch.studentCount ?? students.length} student(s)
      </p>
      <p className="vp-batch-amount">{money(total)} ETB</p>

      {decision === 'approved' && (
        <span className="badge green">Approved — waiting to be forwarded</span>
      )}
      {decision === 'rejected' && (
        <span className="badge red">Returned for correction</span>
      )}
      {batch.adminVpForwardedAt && (
        <span className="badge blue">Forwarded to Finance</span>
      )}
      {batch.paymentConfirmedAt && (
        <span className="badge blue">Payment confirmed</span>
      )}

      <ul className="vp-mini-students">
        {students.slice(0, 4).map((student, index) => (
          <li key={student._id || index}>
            <span>{student.fullName || 'Unknown student'}</span>
            <small className="muted">{student.institutionalId}</small>
            <small className="muted">
              {student.program || '—'} · {student.year ? `Year ${student.year}` : '—'} ·
              📞 {student.phone || '—'} · ✉️ {student.email || '—'}
            </small>
          </li>
        ))}
        {students.length > 4 && (
          <li className="muted">+{students.length - 4} more</li>
        )}
      </ul>

      <button
        type="button"
        className={`btn ${completed ? 'secondary' : selected ? 'secondary' : 'primary'}`}
        onClick={() => onSelect(batch)}
      >
        {completed
          ? 'View history trail →'
          : selected
            ? 'Selected ✓'
            : decision === 'approved'
              ? 'Resume at forward step'
              : 'Select request'}
      </button>
    </article>
  );
}

// FUNCTION 1 — View academically endorsed requests.
// Source: GET /admin-vp/batches (waiting work) and GET /admin-vp/history
// (completed work). Keeping the two columns separate makes it impossible to
// mistake a finished action for one that still needs attention.
export default function Step1Endorsed({
  batches,
  completed = [],
  loading,
  error,
  selectedId,
  onSelect,
  onRefresh,
}) {
  return (
    <>
      <div className="vp-panel-head">
        <h2>1. View academically endorsed requests</h2>
        <p className="muted">
          These requests were endorsed by the <b>Academic VP Office</b>. Pending
          requests need an administrative decision; completed requests are shown
          separately for reference only.
        </p>
      </div>

      <div className="batch-actions">
        <button className="btn secondary" type="button" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh lists'}
        </button>
        <span className="chip">{batches.length} pending</span>
        <span className="chip">{completed.length} completed</span>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading academically endorsed requests…</p>}

      {!loading && (
        <div className="vp-split-columns">
          <section className="vp-action-column pending">
            <header className="vp-action-column-head">
              <div>
                <span className="vp-column-kicker">Pending actions</span>
                <h3>Waiting for the Administrative VP</h3>
              </div>
              <span className="chip">{batches.length}</span>
            </header>

            {batches.length === 0 ? (
              <p className="muted vp-column-empty">
                No academically endorsed requests are waiting for the Administrative VP.
              </p>
            ) : (
              <div className="vp-batch-grid single">
                {batches.map((batch) => (
                  <RequestCard
                    key={batch._id}
                    batch={batch}
                    selected={batch._id === selectedId}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="vp-action-column completed">
            <header className="vp-action-column-head">
              <div>
                <span className="vp-column-kicker">Completed actions</span>
                <h3>Already authorized or returned</h3>
              </div>
              <span className="chip">{completed.length}</span>
            </header>

            {completed.length === 0 ? (
              <p className="muted vp-column-empty">
                Completed decisions will appear here after you authorize or return a request.
              </p>
            ) : (
              <div className="vp-batch-grid single">
                {completed.map((batch) => (
                  <RequestCard
                    key={batch._id}
                    batch={batch}
                    selected={batch._id === selectedId}
                    onSelect={onSelect}
                    completed
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
