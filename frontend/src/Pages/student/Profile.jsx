import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import StudentPortal from './StudentPortal';
import { useAuth } from '../../context/AuthContext';

export default function StudentProfile() {
  const { user, login } = useAuth();
  const [data, setData] = useState({ profile: {}, missingInfo: [] });
  const [form, setForm] = useState({ email: '', phone: '', program: '', year: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [lock, setLock] = useState({ locked: false, reopen: false, reason: '' });

  useEffect(() => {
    api.get('/student/status')
      .then(r => {
        const profile = r.data.profile || user || {};
        setData({ profile, missingInfo: r.data.missingInfo || [] });
        const reopen = r.data.reopenPermission || {};
        const canUpdate = r.data.canUpdateInformation !== false;
        setLock({
          locked: !canUpdate,
          reopen: Boolean(reopen.allowed),
          reason: reopen.reason || '',
        });
        setForm({
          email: profile.email || '',
          phone: profile.phone || '',
          program: profile.program || '',
          year: profile.year || '',
        });
      })
      .catch(() => {});
  }, [user]);

  const onChange = (k) => (e) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    setMsg(''); setErr('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setMsg(''); setErr('');
    try {
      const payload = {
        email: form.email.trim(),
        phone: form.phone.trim(),
        program: form.program.trim(),
        year: Number(form.year),
      };
      const res = await api.patch('/student/profile', payload);
      setMsg(res.data.message || 'Updated successfully');
      setData(prev => ({ ...prev, profile: res.data.profile || prev.profile, missingInfo: res.data.missingInfo || [] }));

      // Keep auth context in sync
      try {
        const stored = localStorage.getItem('user');
        if (stored) {
          const u = JSON.parse(stored);
          const updated = { ...u, ...res.data.profile };
          localStorage.setItem('user', JSON.stringify(updated));
          login(localStorage.getItem('token'), updated);
        }
      } catch { /* ignore */ }
    } catch (error) {
      const dataErr = error.response?.data;
      if (dataErr?.field) {
        setErr(dataErr.message || 'Update failed');
      } else {
        setErr(dataErr?.message || 'Failed to update profile');
      }
    } finally {
      setSaving(false);
    }
  };

  const profile = data.profile || user || {};
  const missing = data.missingInfo || [];
  const disabled = lock.locked;

  return (
    <StudentPortal>
      <h1>My Information</h1>
      <p className="stu-panel-sub">
        Update the details requested by the College Office. Full Name and University ID cannot be changed here.
      </p>

      {lock.locked && (
        <div className="paid-note">
          🔒 <strong>Your payment is complete, so your personal information is locked.</strong>{' '}
          Contact the CS Department if a correction is needed. They can open a controlled
          update window for your account.
        </div>
      )}
      {lock.reopen && (
        <div className="reopen-note">
          <strong>🔓 The CS Department opened an update window for you.</strong>{' '}
          You can correct the fields below.
          {lock.reason && <> Reason: <b>{lock.reason}</b>.</>}
        </div>
      )}

      {missing.length > 0 && (
        <div className="rejection-note">
          <strong>Missing information to complete:</strong>
          <ul style={{ margin: '0.4rem 0 0 1.2rem' }}>
            {missing.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
          <div style={{ marginTop: '0.4rem' }}>
            Fill the fields below or use{' '}
            <Link to="/student/return">Internship Return Form</Link> /{' '}
            <Link to="/student/upload">Completion Letter Upload</Link> to fix form/letter issues.
          </div>
        </div>
      )}

      {msg && <div className="paid-note">{msg}</div>}
      {err && <div className="rejection-note">{err}</div>}

      <div className="stu-panel">
        <h2>Profile Details</h2>
        <form className="stu-form" onSubmit={submit}>
          <div className="stu-field">
            <label>Full Name</label>
            <input value={profile.fullName || ''} disabled />
          </div>
          <div className="stu-field">
            <label>University ID</label>
            <input value={profile.institutionalId || ''} disabled />
          </div>
          <div className="stu-field">
            <label>Email *</label>
            <input type="email" value={form.email} onChange={onChange('email')} required disabled={disabled} />
          </div>
          <div className="stu-field">
            <label>Registered TeleBirr Phone *</label>
            <input value={form.phone} onChange={onChange('phone')} placeholder="+251911223344" required disabled={disabled} />
            <span className="stu-helper">Payments go to this exact phone number.</span>
          </div>
          <div className="stu-field">
            <label>Program / Department *</label>
            <input value={form.program} onChange={onChange('program')} required disabled={disabled} />
          </div>
          <div className="stu-field">
            <label>Year of Study *</label>
            <select value={form.year} onChange={onChange('year')} required disabled={disabled}>
              <option value="">Select year</option>
              {[1,2,3,4,5,6,7].map(y => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </div>
          <div className="stu-form-foot">
            <button className="btn primary" disabled={saving || disabled}>
              {disabled ? 'Locked after payment' : saving ? 'Saving…' : 'Save Changes'}
            </button>
            <Link className="btn secondary" to="/student">Back to Dashboard</Link>
          </div>
        </form>
      </div>
    </StudentPortal>
  );
}
