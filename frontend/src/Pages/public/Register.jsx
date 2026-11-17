import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import './Auth.css';

const ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'cs_dept', label: 'CS Department' },
  { value: 'college', label: 'College Office' },
  { value: 'academic_vp', label: 'Academic VP' },
  { value: 'admin_vp', label: 'Admin VP' },
  { value: 'finance', label: 'Finance' },
];

// Accept local Ethiopian numbers (09…/07…) and international (+251…) formats.
function normalizePhone(value) {
  let phone = String(value || '').replace(/[\s\-()]/g, '').trim();
  if (!phone) return '';
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
  if (/^0[79]\d{8}$/.test(phone)) return `+251${phone.slice(1)}`;
  if (/^[79]\d{8}$/.test(phone)) return `+251${phone}`;
  if (/^251[79]\d{8}$/.test(phone)) return `+${phone}`;
  return phone;
}

function getPasswordStrength(password) {
  if (!password) return { level: 0, label: '', color: '' };

  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) return { level: 1, label: 'Weak', color: '#e74c3c' };
  if (score <= 4) return { level: 2, label: 'Good', color: '#f39c12' };
  return { level: 3, label: 'Strong', color: '#27ae60' };
}

function HelpTooltip({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="help-wrapper">
      <button
        type="button"
        className="help-btn"
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label="Help"
        title="Click for instructions"
      >
        ?
      </button>
      {open && (
        <span className="help-tooltip" role="tooltip">
          {text}
        </span>
      )}
    </span>
  );
}

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: '',
    institutionalId: '',
    phone: '',
    username: '',
    email: '',
    role: 'student',
    year: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const strength = useMemo(() => getPasswordStrength(form.password), [form.password]);

  const set = (key) => (e) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
    setMsg('');
  };

  const validate = () => {
    const e = {};
    if (!form.fullName.trim()) e.fullName = 'Full name is required';
    if (!form.institutionalId.trim()) e.institutionalId = 'University ID is required';
    else if (!/\d{3,}/.test(form.institutionalId)) e.institutionalId = 'Enter your personal ID number from your student card (e.g. WCU1501410). Do not use the university name.';
    if (!form.phone.trim()) e.phone = 'Phone number is required';
    else if (!/^\+?\d{9,15}$/.test(normalizePhone(form.phone))) e.phone = 'Enter a valid phone number. Local (0911223344) and international (+251911223344) formats are both accepted.';
    if (!form.username.trim()) e.username = 'Username is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email address (e.g. abebe@example.com)';
    if (form.role === 'student' && !form.year) {
      e.year = 'Year of study is required';
    } else if (form.role === 'student' && !/^[1-7]$/.test(String(form.year))) {
      e.year = 'Select a year from 1 to 7';
    }
    if (!form.password) e.password = 'Password is required';
    else if (form.password.length < 6) e.password = 'Password must be at least 6 characters';
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setMsg('');
    try {
      const { data } = await api.post('/auth/register', {
        fullName: form.fullName.trim(),
        institutionalId: form.institutionalId.trim(),
        phone: normalizePhone(form.phone),
        username: form.username.trim().toLowerCase(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        ...(form.role === 'student' ? { year: Number(form.year) } : {}),
        password: form.password,
      });
      setMsg(data.message || 'Registered successfully! Please wait for verification.');
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      const data = err.response?.data;
      if (data?.field) {
        setErrors({ [data.field]: data.message });
      }
      setMsg(data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const success = msg.toLowerCase().includes('success') || msg.toLowerCase().includes('registered');

  return (
    <>
      {/* Global navigation bar — mandatory on every page */}
      <Navbar />

      <main className="auth-page auth-register">
        <div className="auth-shell">
          {/* Brand / story panel */}
          <aside className="auth-brand">
            <div className="auth-brand-top">
              <img
                src="/favicon.ico"
                alt="Wachemo University logo"
                className="auth-brand-logo"
              />
              <div className="auth-brand-id">
                <strong>SIPMS</strong>
                <small>Wachemo University</small>
              </div>
            </div>

            <span className="auth-brand-badge">Student registration</span>

            <h2 className="auth-brand-title">
              Your payment journey starts with a <span>verified account</span>.
            </h2>

            <p className="auth-brand-sub">
              Create your account once, then submit documents, track every approval,
              and receive your internship payment — all from one dashboard.
            </p>

            <ul className="auth-brand-points">
              <li>
                <span className="auth-brand-ico" aria-hidden="true">📝</span>
                <div>
                  <strong>Submit online</strong>
                  <small>Complete and send your internship return form.</small>
                </div>
              </li>
              <li>
                <span className="auth-brand-ico" aria-hidden="true">📎</span>
                <div>
                  <strong>Upload documents</strong>
                  <small>Attach your completion letter in seconds.</small>
                </div>
              </li>
              <li>
                <span className="auth-brand-ico" aria-hidden="true">🔔</span>
                <div>
                  <strong>Stay informed</strong>
                  <small>Get notified at every stage of the process.</small>
                </div>
              </li>
            </ul>

            <div className="auth-brand-flow" aria-label="What happens next">
              <span>Register</span><i aria-hidden="true">→</i>
              <span>Get approved</span><i aria-hidden="true">→</i>
              <span>Submit</span><i aria-hidden="true">→</i>
              <span>Get paid</span>
            </div>

            <p className="auth-brand-foot">🔒 Your details are used only to verify you and route your payment.</p>
          </aside>

          {/* Registration panel */}
          <section className="auth-panel">
            <div className="auth-card">
              <header className="auth-card-head">
                <span className="auth-eyebrow">Get started</span>
                <h1>Create your account</h1>
                <p>Fill in your details exactly as they appear on your student records.</p>
              </header>

              <div className="auth-callout">
                <span aria-hidden="true">ℹ️</span>
                <span>
                  <strong>Important:</strong> Each student must use their own unique phone
                  number, email address, University ID, and username. These are used to
                  identify you and cannot be shared.
                </span>
              </div>

              <form onSubmit={submit} className="auth-form" noValidate>
                <div className="auth-form-grid">
                  {/* Full Name */}
                  <div className="auth-field full">
                    <label htmlFor="fullName">
                      Full Name
                      <HelpTooltip text="Enter your full legal name as it appears on your student ID card." />
                    </label>
                    <div className="auth-input">
                      <span className="auth-input-icon" aria-hidden="true">👤</span>
                      <input
                        id="fullName"
                        type="text"
                        placeholder="e.g. Abebe Kebede"
                        value={form.fullName}
                        onChange={set('fullName')}
                        className={errors.fullName ? 'is-error' : ''}
                      />
                    </div>
                    {errors.fullName && <span className="auth-error">{errors.fullName}</span>}
                  </div>

                  {/* University ID */}
                  <div className="auth-field">
                    <label htmlFor="institutionalId">
                      University ID
                      <HelpTooltip text="Enter your own personal student ID number from your student card (e.g. WCU1501410). Do NOT enter the university name. Each student has their own unique ID." />
                    </label>
                    <div className="auth-input">
                      <span className="auth-input-icon" aria-hidden="true">🪪</span>
                      <input
                        id="institutionalId"
                        type="text"
                        placeholder="e.g. WCU1501410"
                        value={form.institutionalId}
                        onChange={set('institutionalId')}
                        className={errors.institutionalId ? 'is-error' : ''}
                      />
                    </div>
                    {errors.institutionalId && <span className="auth-error">{errors.institutionalId}</span>}
                  </div>

                  {/* Phone */}
                  <div className="auth-field">
                    <label htmlFor="phone">
                      Phone Number (TeleBirr)
                      <HelpTooltip text="Enter YOUR OWN personal phone number that is registered for TeleBirr/mobile money. This number will receive all internship payments. Two students cannot use the same phone number." />
                    </label>
                    <div className="auth-input">
                      <span className="auth-input-icon" aria-hidden="true">📱</span>
                      <input
                        id="phone"
                        type="tel"
                        placeholder="e.g. +251911223344"
                        value={form.phone}
                        onChange={set('phone')}
                        className={errors.phone ? 'is-error' : ''}
                      />
                    </div>
                    <small className="auth-hint">Your payment is sent to this number. Must be unique to you.</small>
                    {errors.phone && <span className="auth-error">{errors.phone}</span>}
                  </div>

                  {/* Username */}
                  <div className="auth-field">
                    <label htmlFor="username">
                      Username
                      <HelpTooltip text="Choose a unique username to log into the system. Each username can only be used once." />
                    </label>
                    <div className="auth-input">
                      <span className="auth-input-icon" aria-hidden="true">🏷️</span>
                      <input
                        id="username"
                        type="text"
                        placeholder="Choose a unique username"
                        value={form.username}
                        onChange={set('username')}
                        className={errors.username ? 'is-error' : ''}
                        autoComplete="username"
                      />
                    </div>
                    {errors.username && <span className="auth-error">{errors.username}</span>}
                  </div>

                  {/* Email */}
                  <div className="auth-field">
                    <label htmlFor="email">
                      Email Address
                      <HelpTooltip text="Enter YOUR OWN personal email address. Each email can only be used by one account." />
                    </label>
                    <div className="auth-input">
                      <span className="auth-input-icon" aria-hidden="true">✉️</span>
                      <input
                        id="email"
                        type="email"
                        placeholder="e.g. abebe@example.com"
                        value={form.email}
                        onChange={set('email')}
                        className={errors.email ? 'is-error' : ''}
                        autoComplete="email"
                      />
                    </div>
                    {errors.email && <span className="auth-error">{errors.email}</span>}
                  </div>

                  {/* Account Type */}
                  <div className={`auth-field${form.role === 'student' ? '' : ' full'}`}>
                    <label htmlFor="role">
                      Account Type
                      <HelpTooltip text="Select Student if you are a student registering for internship. Other roles are for university staff." />
                    </label>
                    <div className="auth-input">
                      <span className="auth-input-icon" aria-hidden="true">👥</span>
                      <select id="role" value={form.role} onChange={set('role')}>
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Year of study (students only) */}
                  {form.role === 'student' && (
                    <div className="auth-field">
                      <label htmlFor="year">
                        Year of Study *
                        <HelpTooltip text="Select your current year of study (1-7). This is required for students and used when building payment batches." />
                      </label>
                      <div className="auth-input">
                        <span className="auth-input-icon" aria-hidden="true">📅</span>
                        <select
                          id="year"
                          value={form.year}
                          onChange={set('year')}
                          className={errors.year ? 'is-error' : ''}
                        >
                          <option value="">Select your year</option>
                          {[1, 2, 3, 4, 5, 6, 7].map((y) => (
                            <option key={y} value={String(y)}>Year {y}</option>
                          ))}
                        </select>
                      </div>
                      <small className="auth-hint">
                        Required — the CS Department uses this when building payment batches.
                      </small>
                      {errors.year && <span className="auth-error">{errors.year}</span>}
                    </div>
                  )}

                  {/* Password */}
                  <div className="auth-field">
                    <label htmlFor="password">
                      Password
                      <HelpTooltip text="Create a password with at least 6 characters. For better security, include uppercase letters, numbers, and symbols." />
                    </label>
                    <div className="auth-input">
                      <span className="auth-input-icon" aria-hidden="true">🔒</span>
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Create a strong password"
                        value={form.password}
                        onChange={set('password')}
                        className={`has-toggle${errors.password ? ' is-error' : ''}`}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="auth-toggle"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {form.password && (
                      <div className="auth-strength">
                        <div className="auth-strength-bars">
                          {[1, 2, 3].map((level) => (
                            <span
                              key={level}
                              className={strength.level >= level ? 'active' : ''}
                              style={{
                                background: strength.level >= level ? strength.color : undefined,
                              }}
                            />
                          ))}
                        </div>
                        <span className="auth-strength-label" style={{ color: strength.color }}>
                          {strength.label}
                        </span>
                      </div>
                    )}
                    {errors.password && <span className="auth-error">{errors.password}</span>}
                  </div>

                  {/* Confirm Password */}
                  <div className="auth-field">
                    <label htmlFor="confirmPassword">
                      Confirm Password
                      <HelpTooltip text="Re-enter the same password to confirm it matches." />
                    </label>
                    <div className="auth-input">
                      <span className="auth-input-icon" aria-hidden="true">🔐</span>
                      <input
                        id="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="Re-enter your password"
                        value={form.confirmPassword}
                        onChange={set('confirmPassword')}
                        className={`has-toggle${errors.confirmPassword ? ' is-error' : ''}`}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="auth-toggle"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {showConfirmPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {errors.confirmPassword && <span className="auth-error">{errors.confirmPassword}</span>}
                  </div>
                </div>

                {msg && (
                  <div className={`auth-alert ${success ? 'success' : 'error'}`} role="status">
                    <span aria-hidden="true">{success ? '✅' : '⚠️'}</span>
                    <span>{msg}</span>
                  </div>
                )}

                <button type="submit" className="auth-submit" disabled={loading}>
                  {loading ? 'Creating account…' : 'Create Account'}
                  {!loading && <span aria-hidden="true">→</span>}
                </button>
              </form>

              <p className="auth-switch">
                Already have an account? <Link to="/login">Login here</Link>
              </p>
            </div>
          </section>
        </div>
      </main>

      {/* Shared footer — same on every page */}
      <Footer />
    </>
  );
}
