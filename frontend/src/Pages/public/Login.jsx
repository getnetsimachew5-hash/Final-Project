import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import './Auth.css';

const roleHome = {
  student: '/student',
  cs_dept: '/cs-dept',
  college: '/college',
  academic_vp: '/academic-vp',
  admin_vp: '/admin-vp',
  finance: '/finance',
  admin: '/admin',
};

// Password shared by all seeded demo staff accounts (see backend/seed.js).
const DEMO_PASSWORD = 'Sipms@2026';

// All system actors
const ACTORS = [
  { username: 'admin',      label: 'Admin',         role: 'System Administrator',    color: '#7c3aed', icon: '🛡️' },
  { username: 'csdept',     label: 'CS Department', role: 'CS Dept Officer',         color: '#2563eb', icon: '💻' },
  { username: 'college',    label: 'College',       role: 'College Office',          color: '#0d9488', icon: '🏫' },
  { username: 'academicvp', label: 'Academic VP',   role: 'Academic Vice President', color: '#d97706', icon: '🎖️' },
  { username: 'adminvp',    label: 'Admin VP',      role: 'Administrative VP',       color: '#db2777', icon: '⚖️' },
  { username: 'finance',    label: 'Finance',       role: 'Finance Office',          color: '#92400e', icon: '💳' },
];

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [form, setForm] = useState({
    username: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (key) => (e) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    setError('');
  };

  // Shared login routine used by both the form and the demo role buttons.
  const doLogin = async (username, password) => {
    setError('');

    if (!username.trim() || !password) {
      setError('Username and password are required');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', {
        username: username.trim().toLowerCase(),
        password,
      });

      login(data.token, data.user);
      const path = roleHome[data.user.role] || '/';
      navigate(path);
    } catch (err) {
      const d = err.response?.data;
      if (d?.pendingApproval || d?.needsApproval) {
        setError('Your account is awaiting administrator approval. You can log in once an admin verifies your account.');
      } else if (err.response?.status === 401) {
        setError(d?.message || 'Invalid username or password. You can log in with your username, University ID or email.');
      } else if (!err.response) {
        // No response at all: backend not running, or the browser blocked the
        // request (CORS / wrong port). Give a real diagnosis, not a vague one.
        setError('Cannot reach the server. Make sure the backend is running on http://localhost:5000 (run "npm run dev" or "node server.js" in backend/).');
      } else {
        setError(d?.message || `Login failed (server error ${err.response.status}). Please try again.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    doLogin(form.username, form.password);
  };

  // Demo role buttons: ALWAYS use the demo password so a stale/autofilled
  // password value can never cause a 401. Signs the actor in immediately.
  const signInAs = (username) => {
    setForm({ username, password: DEMO_PASSWORD });
    doLogin(username, DEMO_PASSWORD);
  };

  return (
    <>
      {/* Global navigation bar — mandatory on every page */}
      <Navbar />

      <main className="auth-page auth-login">
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

            <span className="auth-brand-badge">Internship payments, simplified</span>

            <h2 className="auth-brand-title">
              From submission to <span>payment</span> — all in one place.
            </h2>

            <p className="auth-brand-sub">
              The Student Internship Payment Management System connects students,
              departments, and university leadership through one transparent,
              audited workflow.
            </p>

            <ul className="auth-brand-points">
              <li>
                <span className="auth-brand-ico" aria-hidden="true">📄</span>
                <div>
                  <strong>Paperless submissions</strong>
                  <small>Return forms and completion letters, online.</small>
                </div>
              </li>
              <li>
                <span className="auth-brand-ico" aria-hidden="true">🔎</span>
                <div>
                  <strong>Live status tracking</strong>
                  <small>See exactly where every request stands.</small>
                </div>
              </li>
              <li>
                <span className="auth-brand-ico" aria-hidden="true">💳</span>
                <div>
                  <strong>Verified payments</strong>
                  <small>One student per payment, fully audited.</small>
                </div>
              </li>
            </ul>

            <div className="auth-brand-flow" aria-label="Workflow stages">
              <span>Submit</span><i aria-hidden="true">→</i>
              <span>Verify</span><i aria-hidden="true">→</i>
              <span>Approve</span><i aria-hidden="true">→</i>
              <span>Pay</span>
            </div>

            <p className="auth-brand-foot">🔒 Role-based access · Every action logged</p>
          </aside>

          {/* Sign-in panel */}
          <section className="auth-panel">
            <div className="auth-card">
              <header className="auth-card-head">
                <span className="auth-eyebrow">Welcome back</span>
                <h1>Sign in to your account</h1>
                <p>Use your username, University ID, or email address to continue.</p>
              </header>

              <form onSubmit={submit} className="auth-form" noValidate>
                <div className="auth-field">
                  <label htmlFor="username">Username / University ID / Email</label>
                  <div className="auth-input">
                    <span className="auth-input-icon" aria-hidden="true">👤</span>
                    <input
                      id="username"
                      type="text"
                      placeholder="Username, University ID or email"
                      value={form.username}
                      onChange={set('username')}
                      autoComplete="username"
                      autoFocus
                    />
                  </div>
                </div>

                <div className="auth-field">
                  <label htmlFor="password">Password</label>
                  <div className="auth-input">
                    <span className="auth-input-icon" aria-hidden="true">🔒</span>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={form.password}
                      onChange={set('password')}
                      autoComplete="current-password"
                      className="has-toggle"
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
                </div>

                {error && (
                  <div className="auth-alert error" role="alert">
                    <span aria-hidden="true">⚠️</span>
                    <span>{error}</span>
                  </div>
                )}

                <button type="submit" className="auth-submit" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign In'}
                  {!loading && <span aria-hidden="true">→</span>}
                </button>
              </form>

              <div className="auth-note">
                <span aria-hidden="true">🎓</span>
                <span>
                  <b>Students:</b> log in with the <b>username, University ID or email</b> you
                  registered and the <b>password you created</b>. A new account can only log in
                  after an administrator approves it.
                </span>
              </div>

              <div className="auth-divider"><span>Quick demo access</span></div>
              <p className="auth-demo-hint">Click a role to sign in instantly with its demo account.</p>

              <div className="auth-actors">
                {ACTORS.map((actor) => (
                  <button
                    key={actor.username}
                    type="button"
                    className="auth-actor"
                    style={{ '--actor-color': actor.color }}
                    onClick={() => signInAs(actor.username)}
                    disabled={loading}
                    title={`Login as ${actor.role}`}
                  >
                    <span className="auth-actor-dot" aria-hidden="true">{actor.icon}</span>
                    <span className="auth-actor-text">
                      <span className="auth-actor-label">{actor.label}</span>
                      <span className="auth-actor-role">{actor.role}</span>
                    </span>
                  </button>
                ))}
              </div>

              <p className="auth-switch">
                New student? <Link to="/register">Create an account</Link>
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
