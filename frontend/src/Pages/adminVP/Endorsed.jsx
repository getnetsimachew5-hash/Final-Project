import { useEffect, useState } from 'react';
import api from '../../api/axios';
import AdminVPPortal from './AdminVPPortal';
import StatusBadge from '../../components/StatusBadge';
import PaymentRequestStatus from '../../components/PaymentRequestStatus';

const fmt = (n) => (Number(n)||0).toLocaleString();

export default function Endorsed() {
  const [batches, setBatches] = useState([]);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState({});
  const [busy, setBusy] = useState('');

  const setC = (id) => (e) => setComments(p => ({ ...p, [id]: e.target.value }));
  const load = () =>
    api.get('/admin-vp/batches')
      .then(r => setBatches(r.data.batches || []))
      .catch(e => setErr(e.response?.data?.message || 'Failed to load'))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const approve = async (id) => {
    const c = (comments[id]||'').trim();
    if (!c) { setErr('Comment is MANDATORY when approving (confirm payment availability/authorization).'); return; }
    setErr(''); setSuccess(''); setBusy('a:'+id);
    try {
      const res = await api.post(`/admin-vp/batches/${id}/authorize`, { comment: c });
      setSuccess(res.data?.message || 'Authorized — forwarded to Finance.');
      setComments(p => ({ ...p, [id]: '' }));
      load();
    } catch (e) { setErr(e.response?.data?.message || 'Failed'); }
    finally { setBusy(''); }
  };
  const reject = async (id) => {
    const c = (comments[id]||'').trim();
    if (!c) { setErr('Rejection reason (comment) is MANDATORY â€” explain what needs correction.'); return; }
    setErr(''); setSuccess(''); setBusy('r:'+id);
    try {
      const res = await api.post(`/admin-vp/batches/${id}/reject`, { comment: c });
      setSuccess(res.data?.message || 'Rejected â€” returned for correction.');
      setComments(p => ({ ...p, [id]: '' }));
      load();
    } catch (e) { setErr(e.response?.data?.message || 'Failed'); }
    finally { setBusy(''); }
  };

  return (
    <AdminVPPortal>
      <h1>Academically Endorsed Requests</h1>
      <p className="muted">2–3 Review admin requirements &amp; confirm payment availability/authorization. 4–6 Approve/Reject + comments. 7 Forward to Finance on approval.</p>

      {err && <p className="error">{err}</p>}
      {success && <p className="notice-ok">âœ… {success}</p>}
      {loading && <p className="muted">Loadingâ€¦</p>}
      {batches.length === 0 && !loading && <p className="muted">No batches pending authorization.</p>}

      {batches.map(b => (
        <div key={b._id} className="batch-card">
          <div className="batch-head">
            <h3>{b.batchName}</h3>
            <StatusBadge status={b.status} />
            <span className="muted">{b.semester} Â· {b.academicYear}</span>
          </div>
          <p>{b.studentCount} student(s) Â· {fmt(b.totalAmount)} ETB</p>
          <ul className="student-review-list">
            {(b.requests||[]).map(r => (
              <li key={r._id} className="student-review-item">
                <span className="student-name">{r.student?.fullName}</span>
                <small className="muted">{r.student?.institutionalId}</small>
<small className="muted">
                    {r.student?.program || '—'} · {r.student?.year ? "Year " + r.student.year : "—"} · 📞 {r.student?.phone || '—'} · ✉️ {r.student?.email || '—'}
                  </small>
                <PaymentRequestStatus status={r.status} />
              </li>
            ))}
          </ul>

          <textarea className="comment" placeholder="Comment â€” MANDATORY for Authorize (confirm payment authorization) and for Reject (explain correction needed)." value={comments[b._id]||''} onChange={setC(b._id)} />

          <div className="batch-actions">
            <button className="btn primary" onClick={() => approve(b._id)} disabled={busy==='a:'+b._id}>{busy==='a:'+b._id ? 'Authorizing…' : 'Approve → Forward to Finance'}</button>
            <button className="btn danger" onClick={() => reject(b._id)} disabled={busy==='r:'+b._id}>{busy==='r:'+b._id ? 'Rejectingâ€¦' : 'Reject â†’ Return for Correction'}</button>
          </div>
        </div>
      ))}
    </AdminVPPortal>
  );
}
