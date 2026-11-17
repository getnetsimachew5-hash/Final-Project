import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import AdminVPPortal from './AdminVPPortal';
import StatusBadge from '../../components/StatusBadge';
import PaymentRequestStatus from '../../components/PaymentRequestStatus';

const fmt = (n) => (Number(n) || 0).toLocaleString();

const apiError = (e, fallback) =>
  e.response?.data?.errors?.[0]?.msg || e.response?.data?.message || fallback;

// Administrative requirements review checklist. Same data as Endorsed.jsx
// (GET /admin-vp/batches): review admin requirements and payment availability
// before authorization.
export default function Review() {
  const [batches, setBatches] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin-vp/batches')
      .then(r => setBatches(r.data.batches || []))
      .catch(e => setErr(apiError(e, 'Failed to load endorsed batches')))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminVPPortal>
      <h1>Administrative Requirements Review</h1>
      <p className="muted">
        Review administrative requirements for each endorsed batch: compliance
        with university procedures and confirmation that funds are available.
        Use the comment box on this page's actions in â€œAcademically Endorsedâ€
        to Approve or Reject.
      </p>

      {err && <p className="error">{err}</p>}
      {loading && <p className="muted">Loadingâ€¦</p>}
      {!loading && batches.length === 0 && (
        <p className="muted">No academically endorsed batches awaiting administrative review.</p>
      )}

      {batches.map(b => (
        <div key={b._id} className="batch-card">
          <div className="batch-head">
            <h3>{b.batchName}</h3>
            <StatusBadge status={b.status} />
            <span className="muted">{b.semester} Â· {b.academicYear}</span>
          </div>
          <p>
            {b.studentCount} student(s) Â· total {fmt(b.totalAmount)} ETB â€”
            confirm this amount is available and authorized per university procedure.
          </p>
          <ul className="student-review-list">
            {(b.requests || []).map(r => (
              <li key={r._id} className="student-review-item">
                <span className="student-name">{r.student?.fullName || 'â€”'}</span>
                <small className="muted">{r.student?.institutionalId}</small>
<small className="muted">
                    {r.student?.program || '—'} · {r.student?.year ? "Year " + r.student.year : "—"} · 📞 {r.student?.phone || '—'} · ✉️ {r.student?.email || '—'}
                  </small>
                <span className="chip">{fmt(r.amount)} ETB</span>
                <PaymentRequestStatus status={r.status} />
              </li>
            ))}
          </ul>
          <div className="batch-actions">
            <Link className="btn primary" to="/admin-vp/endorsed">Review &amp; Authorize â†’</Link>
          </div>
        </div>
      ))}
    </AdminVPPortal>
  );
}
