import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import StudentPortal from './StudentPortal';

const EMPTY = {
  orgName: '', orgAddress: '', supervisorName: '', supervisorPhone: '',
  startDate: '', endDate: '',
};

export default function ReturnForm() {
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState('');
  const [status, setStatus] = useState(null); // existing submission, if any
  const [errors, setErrors] = useState({});   // field-level errors
  const [missing, setMissing] = useState([]); // incomplete profile items (from API)
  const [fixPage, setFixPage] = useState('');

  const set = k => e => {
    const value = e.target.value;
    setForm(f => ({ ...f, [k]: value }));
    setErrors(prev => {
      if (!prev[k]) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });
  };

  // Missing items that only the profile page can fix. The status endpoint also
  // reports "Internship return form" / "Completion letter", which are handled
  // by this page and the upload page, so they are filtered out here.
  const PROFILE_ITEMS = [
    'Student account (account was removed)',
    'Full name',
    'University ID',
    'Email address',
    'Registered TeleBirr phone',
    'Program / department',
    'Year of study (1–7)',
  ];

  const load = () =>
    api.get('/student/status')
      .then(r => {
        setStatus(r.data);
        const profileMissing = (r.data.missingInfo || []).filter(m => PROFILE_ITEMS.includes(m));
        setMissing(profileMissing);
        setFixPage(profileMissing.length ? '/student/profile' : '');
      })
      .catch(() => setStatus(null));

  useEffect(() => { load(); }, []);

  // Prefill the form with an existing submission so the student can review
  // or correct the information.
  useEffect(() => {
    const ret = status?.return;
    if (!ret) return;
    setForm({
      orgName: ret.orgName || '',
      orgAddress: ret.orgAddress || '',
      supervisorName: ret.supervisorName || '',
      supervisorPhone: ret.supervisorPhone || '',
      startDate: ret.startDate?.slice(0, 10) || '',
      endDate: ret.endDate?.slice(0, 10) || '',
    });
  }, [status]);

  const rejected = status?.canResubmit;                 // rejected or controlled post-paid update
  const rejectReason = status?.return?.rejectionReason;
  const reopen = status?.reopenPermission || {};
  const isPaid = Boolean(status?.paymentCompleted);
  const locked = Boolean(
    status?.return
    && !rejected
    && (status.return.verified || isPaid)
    && !reopen.allowed
  );

  /* Same rules as the API validator (backend/src/utils/returnValidation.js),
     so the student gets an instant answer without a round-trip. */
  const validate = () => {
    const e = {};
    const name = form.orgName.trim();
    const addr = form.orgAddress.trim();
    const sup = form.supervisorName.trim();
    const phone = form.supervisorPhone.replace(/[\s\-()]/g, '');

    if (!name) e.orgName = 'Organization name is required.';
    else if (name.length < 2) e.orgName = 'Use at least 2 characters.';
    else if (name.length > 120) e.orgName = 'Maximum 120 characters.';
    else if (!/\p{L}/u.test(name)) e.orgName = 'Must contain letters, not only numbers or symbols.';

    if (!addr) e.orgAddress = 'Organization address is required.';
    else if (addr.length < 3) e.orgAddress = 'Use at least 3 characters.';
    else if (addr.length > 200) e.orgAddress = 'Maximum 200 characters.';
    else if (!/\p{L}/u.test(addr)) e.orgAddress = 'Must contain letters, not only numbers.';

    if (!sup) e.supervisorName = 'Supervisor name is required.';
    else if (sup.length < 2) e.supervisorName = 'Use at least 2 characters.';
    else if (sup.length > 120) e.supervisorName = 'Maximum 120 characters.';
    else if (!/\p{L}/u.test(sup)) e.supervisorName = 'Must contain letters, not only numbers or symbols.';

    if (phone && !/^\+?\d{9,15}$/.test(phone)) {
      e.supervisorPhone = 'Use 9–15 digits, e.g. +251911223344.';
    }

    if (!form.startDate) e.startDate = 'Select the internship start date.';
    if (!form.endDate) e.endDate = 'Select the internship end date.';

    if (form.startDate && form.endDate && !e.startDate && !e.endDate) {
      const s = new Date(form.startDate);
      const en = new Date(form.endDate);
      if (Number.isNaN(s.getTime()) || Number.isNaN(en.getTime())) {
        e.startDate = 'Enter valid dates.';
      } else if (en < s) {
        e.endDate = 'End date cannot be before the start date.';
      } else if (Math.floor((en - s) / 86400000) + 1 > 365) {
        e.endDate = 'An internship cannot be longer than 365 days.';
      }
    }

    return e;
  };

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    setMissing([]);

    const clientErrors = validate();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setMsg('⚠️ Please correct the highlighted fields before submitting.');
      return;
    }
    setErrors({});

    try {
      const { data } = await api.post('/student/return', form);
      setMsg('✅ ' + (data.message || (rejected ? 'Correct information resubmitted.' : 'Return form submitted.')));
      await load();
    } catch (err) {
      const data = err.response?.data || {};

      // Field-level messages → highlight the exact inputs
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        const map = {};
        data.errors.forEach(item => {
          if (item?.field && !map[item.field]) map[item.field] = item.message;
        });
        setErrors(map);
      }

      // Profile completeness gate → show the checklist with a fix link
      setMissing(data.missingInfo || []);
      setFixPage(data.fixPage || '');

      setMsg('⚠️ ' + (data.message || 'Something went wrong. Please try again.'));
    }
  };

  const ok = msg.startsWith('✅');

  // Live, inclusive day count for THIS student's own dates (each student's
  // internship can be a different length). Matches the backend calculation.
  const internshipDays = (() => {
    if (!form.startDate || !form.endDate) return 0;
    const s = new Date(form.startDate);
    const e = new Date(form.endDate);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
    return Math.floor((e - s) / 86400000) + 1;
  })();

  return (
    <StudentPortal>
      <h1>Internship Return Form{rejected ? ' (Resubmit)' : ''}</h1>
      <p className="stu-panel-sub">
        Tell us where you did your internship. The CS Department reviews this information
        before your payment can move forward.
      </p>

      {/* Correction request from whichever office reviewed the submission. */}
      {rejected && rejectReason && (
        <div className="rejection-note">
          <strong>📨 Correction requested by the reviewing office:</strong> {rejectReason}
          <br />
          <span style={{ color: '#7f1d1d' }}>
            Your information was incomplete or incorrect. Correct the fields below, resubmit,
            then upload a new completion letter if needed.
          </span>
        </div>
      )}
      {reopen.allowed && (
        <div className="reopen-note">
          <strong>🔓 The CS Department opened an update window for you.</strong>{' '}
          Correct the information below, resubmit it, and upload a new completion letter if needed.
          {reopen.reason && <> Reason: <b>{reopen.reason}</b>.</>}
        </div>
      )}
      {isPaid && !reopen.allowed && (
        <div className="paid-note">
          ✅ <strong>Your payment has been sent via TeleBirr.</strong> Your information is locked
          after payment. Contact the CS Department if a correction is needed.
        </div>
      )}
      {locked && !isPaid && (
        <div className="success">
          🔒 Your submission is verified and locked. Contact the CS Department if anything needs to change.
        </div>
      )}

      {/* Profile gate — the API refuses the form until these are filled */}
      {missing.length > 0 && (
        <div className="rejection-note">
          <strong>⚠️ Complete your personal information first:</strong>
          <ul style={{ margin: '0.4rem 0 0 1.2rem' }}>
            {missing.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
          <div style={{ marginTop: '0.5rem' }}>
            <Link className="btn small primary" to={fixPage || '/student/profile'}>
              Fix my information →
            </Link>
          </div>
        </div>
      )}

      <div className="stu-panel">
        <h2>{rejected ? 'Correct & Resubmit' : 'Internship Details'}</h2>
        <form className="stu-form" onSubmit={submit} noValidate>
          <div className="stu-field">
            <label htmlFor="orgName">Organization Name</label>
            <input id="orgName" placeholder="e.g. Ethio Telecom" value={form.orgName}
                   onChange={set('orgName')} disabled={locked} required
                   className={errors.orgName ? 'input-error' : ''}
                   aria-invalid={Boolean(errors.orgName)} />
            {errors.orgName && <span className="stu-error-text">{errors.orgName}</span>}
          </div>

          <div className="stu-field">
            <label htmlFor="orgAddress">Organization Address</label>
            <input id="orgAddress" placeholder="City / area / street" value={form.orgAddress}
                   onChange={set('orgAddress')} disabled={locked} required
                   className={errors.orgAddress ? 'input-error' : ''}
                   aria-invalid={Boolean(errors.orgAddress)} />
            {errors.orgAddress && <span className="stu-error-text">{errors.orgAddress}</span>}
          </div>

          <div className="stu-field">
            <label htmlFor="supervisorName">Supervisor Name</label>
            <input id="supervisorName" placeholder="Full name of your supervisor" value={form.supervisorName}
                   onChange={set('supervisorName')} disabled={locked} required
                   className={errors.supervisorName ? 'input-error' : ''}
                   aria-invalid={Boolean(errors.supervisorName)} />
            {errors.supervisorName && <span className="stu-error-text">{errors.supervisorName}</span>}
          </div>

          <div className="stu-field">
            <label htmlFor="supervisorPhone">Supervisor Phone <span className="stu-helper">(optional)</span></label>
            <input id="supervisorPhone" placeholder="e.g. +251911223344" value={form.supervisorPhone}
                   onChange={set('supervisorPhone')} disabled={locked}
                   className={errors.supervisorPhone ? 'input-error' : ''}
                   aria-invalid={Boolean(errors.supervisorPhone)} />
            {errors.supervisorPhone
              ? <span className="stu-error-text">{errors.supervisorPhone}</span>
              : <span className="stu-helper">9–15 digits. Leave empty if unknown.</span>}
          </div>

          <div className="stu-field">
            <label htmlFor="startDate">Internship Start Date</label>
            <input id="startDate" type="date" value={form.startDate}
                   onChange={set('startDate')} disabled={locked} required
                   className={errors.startDate ? 'input-error' : ''}
                   aria-invalid={Boolean(errors.startDate)} />
            {errors.startDate && <span className="stu-error-text">{errors.startDate}</span>}
          </div>

          <div className="stu-field">
            <label htmlFor="endDate">Internship End Date</label>
            <input id="endDate" type="date" value={form.endDate}
                   min={form.startDate || undefined}
                   onChange={set('endDate')} disabled={locked} required
                   className={errors.endDate ? 'input-error' : ''}
                   aria-invalid={Boolean(errors.endDate)} />
            {errors.endDate && <span className="stu-error-text">{errors.endDate}</span>}
            {internshipDays > 0 && (
              <span className="stu-helper">
                📅 Duration: <b>{internshipDays}</b> day(s) → estimated stipend{' '}
                <b>{internshipDays * 100} ETB</b>
              </span>
            )}
          </div>

          <div className="stu-form-foot">
            {!locked && (
              <button className="btn primary" type="submit">
                {rejected ? '🔁 Resubmit Corrected Information' : '✅ Submit Return Form'}
              </button>
            )}
            <span className="stu-helper">
              Your stipend is calculated as 100 ETB × internship days.
            </span>
          </div>
        </form>

        {msg && <p className={ok ? 'success' : 'error'}>{msg}</p>}
      </div>
    </StudentPortal>
  );
}
