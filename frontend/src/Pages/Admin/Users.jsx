import { useEffect, useState } from 'react';
import api from '../../api/axios';
import AdminPortal from './AdminPortal';

/* ── helpers ─────────────────────────────────────────────────── */
const ROLE_OPTIONS = {
  student: '🎓 Student',
  cs_dept: '💻 CS Dept',
  college: '🏫 College',
  academic_vp: '🎖️ Academic VP',
  admin_vp: '⚖️ Admin VP',
  finance: '💳 Finance',
  admin: '🔐 Admin',
};

// Legacy accounts may still be listed, but their role cannot be assigned.
const ROLE_LABELS = {
  ...ROLE_OPTIONS,
  industrial: '🚫 Retired account',
};

const STATUS_COLORS = {
  active:    { bg: '#dcfce7', color: '#15803d' },
  pending:   { bg: '#fef3c7', color: '#b45309' },
  suspended: { bg: '#fee2e2', color: '#dc2626' },
};

function Badge({ text, bg, color }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.2rem 0.65rem',
      borderRadius: 999,
      fontSize: '0.74rem',
      fontWeight: 700,
      letterSpacing: '0.4px',
      background: bg,
      color,
    }}>{text}</span>
  );
}

/* ── Component ───────────────────────────────────────────────── */
export default function Users() {
  const [pending, setPending] = useState([]);
  const [users,   setUsers]   = useState([]);
  const [msg,     setMsg]     = useState({ text: '', ok: true });
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [editingUser, setEditingUser] = useState(null); // modal state
  const [newUser, setNewUser] = useState(null);         // create-user modal state

  const load = async () => {
    setLoading(true);
    try {
      const [pRes, uRes] = await Promise.all([
        api.get('/admin/users/pending'),
        api.get('/admin/users'),
      ]);
      // Both endpoints now return plain arrays
      setPending(Array.isArray(pRes.data) ? pRes.data : (pRes.data.users || []));
      setUsers(Array.isArray(uRes.data) ? uRes.data : (uRes.data.users || []));
    } catch (e) {
      setMsg({ text: '❌ Failed to load users: ' + (e.response?.data?.message || e.message), ok: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const flash = (text, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg({ text: '', ok: true }), 6000);
  };

  /* ── Approve: staff roles → set accountStatus=active ──────── */
  const approve = async (u) => {
    try {
      await api.patch(`/admin/users/${u._id}/approve`);
      flash(`✅ ${u.fullName} approved — they can now log in.`);
      load();
    } catch (e) {
      flash('❌ ' + (e.response?.data?.message || e.message), false);
    }
  };

  /* ── Verify student: sets verifiedIdentity + active ─────────── */
  const verifyStudent = async (u) => {
    try {
      await api.patch(`/admin/users/${u._id}/verify`);
      flash(`✅ ${u.fullName}'s identity verified — student can now log in.`);
      load();
    } catch (e) {
      flash('❌ ' + (e.response?.data?.message || e.message), false);
    }
  };

  /* ── Reject ─────────────────────────────────────────────────── */
  const reject = async (u) => {
    const reason = window.prompt(`Reason for rejecting ${u.fullName}'s registration:`);
    if (!reason) return;
    try {
      await api.patch(`/admin/users/${u._id}/reject`, { reason });
      flash(`❌ ${u.fullName} rejected and suspended.`);
      load();
    } catch (e) {
      flash('❌ ' + (e.response?.data?.message || e.message), false);
    }
  };

  /* ── Update user fields ───────────────────────────────────────── */
  const saveEdit = async () => {
    if (!editingUser) return;
    try {
      await api.patch(`/admin/users/${editingUser._id}`, {
        fullName:       editingUser.fullName,
        institutionalId: editingUser.institutionalId,
        username:       editingUser.username,
        email:          editingUser.email,
        role:           editingUser.role,
        accountStatus:  editingUser.accountStatus,
        phone:          editingUser.phone,
      });
      flash(`✅ ${editingUser.fullName} updated successfully.`);
      setEditingUser(null);
      load();
    } catch (e) {
      flash('❌ ' + (e.response?.data?.message || e.message), false);
    }
  };

  /* ── Delete user permanently ─────────────────────────────────── */
  const deleteUser = async (u) => {
    const confirmed = window.confirm(
      `⚠️ PERMANENT ACTION\n\nDelete user "${u.fullName}" (${ROLE_LABELS[u.role] || u.role})?\n\nTheir account and login will be removed permanently. This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      const res = await api.delete(`/admin/users/${u._id}`);
      flash(`🗑️ ${res.data?.message || `${u.fullName} deleted`}`);
      load();
    } catch (e) {
      flash('❌ ' + (e.response?.data?.message || e.message), false);
    }
  };

  /* ── Add New User: admin adds new users to the system ─────── */
  const EMPTY_NEW = {
    fullName: '', institutionalId: '', username: '', email: '',
    phone: '', role: 'student', year: '', password: '',
  };
  const openCreate = () => setNewUser({ ...EMPTY_NEW });

  const saveCreate = async () => {
    if (!newUser) return;
    try {
      const body = {
        fullName:       newUser.fullName,
        institutionalId: newUser.institutionalId,
        username:       newUser.username.trim().toLowerCase(),
        email:          newUser.email.trim().toLowerCase(),
        phone:          newUser.phone,
        role:           newUser.role,
        password:       newUser.password,
      };
      if (newUser.role === 'student') body.year = Number(newUser.year);
      const res = await api.post('/admin/users', body);
      flash(`✅ ${res.data?.message || 'User created'}`);
      setNewUser(null);
      load();
    } catch (e) {
      flash('❌ ' + (e.response?.data?.message || e.message), false);
    }
  };

  /* ── Filtered users ──────────────────────────────────────────── */
  const filtered = users.filter(u => {
    const matchSearch =
      !search ||
      u.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      u.username?.toLowerCase().includes(search.toLowerCase()) ||
      u.institutionalId?.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  return (
    <AdminPortal>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.75rem' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(1.4rem,3vw,2rem)', fontWeight: 900, color: '#0f172a' }}>
            👥 User Management
          </h1>
          <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            Approve registrations, verify students, and manage all accounts
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button className="btn primary" onClick={openCreate} style={{ fontSize: '0.88rem' }}>
            ➕ Add New User
          </button>
          <button className="btn" onClick={load} style={{ fontSize: '0.88rem' }}>🔄 Refresh</button>
        </div>
      </div>

      {/* Flash message */}
      {msg.text && (
        <div className={msg.ok ? 'success' : 'error'} style={{ marginBottom: '1rem' }}>
          {msg.text}
        </div>
      )}

      {/* ── PENDING APPROVALS ───────────────────────────────────── */}
      <section style={{
        background: '#fffbeb',
        border: '1px solid #fcd34d',
        borderLeft: '5px solid #f59e0b',
        borderRadius: 14,
        padding: '1.25rem 1.5rem',
        marginBottom: '2rem',
      }}>
        <h2 style={{ margin: '0 0 1rem', fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', fontWeight: 800, color: '#92400e', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          ⏳ Pending Approvals
          <span style={{ background: '#f59e0b', color: '#fff', borderRadius: 999, fontSize: '0.75rem', padding: '0.15rem 0.55rem', fontWeight: 700 }}>
            {pending.length}
          </span>
        </h2>

        {loading ? (
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Loading…</p>
        ) : pending.length === 0 ? (
          <p style={{ color: '#65a30d', fontWeight: 600, fontSize: '0.9rem' }}>🎉 No pending registrations — all caught up!</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Univ. ID</th>
                  <th>Phone</th>
                  <th>Registered</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pending.map(u => (
                  <tr key={u._id}>
                    <td style={{ fontWeight: 600 }}>{u.fullName}</td>
                    <td style={{ fontSize: '0.88rem', color: '#475569' }}>{u.username}</td>
                    <td>
                      <Badge
                        text={ROLE_LABELS[u.role] || u.role}
                        bg="#eff6ff" color="#1d4ed8"
                      />
                    </td>
                    <td style={{ fontSize: '0.88rem', fontFamily: 'monospace' }}>{u.institutionalId || '—'}</td>
                    <td style={{ fontSize: '0.88rem' }}>{u.phone || '—'}</td>
                    <td style={{ fontSize: '0.82rem', color: '#64748b' }}>
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {u.role === 'student' ? (
                          /* Students need identity verification, not just approve */
                          <button
                            className="btn primary"
                            style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
                            onClick={() => verifyStudent(u)}
                            title="Verify student identity and activate account"
                          >
                            ✅ Verify & Activate
                          </button>
                        ) : (
                          <button
                            className="btn primary"
                            style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
                            onClick={() => approve(u)}
                          >
                            ✅ Approve
                          </button>
                        )}
                        <button
                          style={{
                            fontSize: '0.8rem', padding: '0.4rem 0.85rem',
                            background: '#fee2e2', color: '#dc2626',
                            border: '1px solid #fca5a5', borderRadius: 8,
                            cursor: 'pointer', fontWeight: 600,
                          }}
                          onClick={() => reject(u)}
                        >
                          ❌ Reject
                        </button>
                        <button
                          className="btn"
                          style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem' }}
                          onClick={() => setEditingUser({ ...u })}
                        >
                          ✏️ Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── ALL USERS ──────────────────────────────────────────── */}
      <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '1.25rem 1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
            All Users <span style={{ color: '#64748b', fontWeight: 500 }}>({filtered.length})</span>
          </h2>
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="🔍 Search name / username / ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 240, padding: '0.45rem 0.85rem', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: '0.88rem' }}
            />
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              style={{ padding: '0.45rem 0.85rem', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: '0.88rem', background: '#f8fafc' }}
            >
              <option value="all">All Roles</option>
              {Object.entries(ROLE_OPTIONS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', textAlign: 'center', padding: '2rem' }}>Loading users…</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Univ. ID</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Can Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const st = STATUS_COLORS[u.accountStatus] || { bg: '#f1f5f9', color: '#64748b' };
                  const canLogin = u.role === 'student'
                    ? u.verifiedIdentity && u.accountStatus !== 'suspended'
                    : u.accountStatus === 'active';
                  return (
                    <tr key={u._id}>
                      <td style={{ fontWeight: 600 }}>{u.fullName}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.88rem', color: '#475569' }}>
                        {u.institutionalId || '—'}
                      </td>
                      <td style={{ fontSize: '0.88rem', color: '#475569' }}>{u.username}</td>
                      <td>
                        <Badge text={ROLE_LABELS[u.role] || u.role} bg="#eff6ff" color="#1d4ed8" />
                      </td>
                      <td style={{ fontSize: '0.88rem' }}>{u.phone || '—'}</td>
                      <td>
                        <Badge text={u.accountStatus} bg={st.bg} color={st.color} />
                      </td>
                      <td>
                        <span style={{ fontSize: '1.1rem' }}>{canLogin ? '✅' : '🔴'}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <button
                            className="btn"
                            style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem' }}
                            onClick={() => setEditingUser({ ...u })}
                          >
                            ✏️ Edit
                          </button>
                          {u.accountStatus === 'pending' && u.role !== 'student' && (
                            <button
                              className="btn primary"
                              style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem' }}
                              onClick={() => approve(u)}
                            >
                              ✅ Approve
                            </button>
                          )}
                          {u.role === 'student' && !u.verifiedIdentity && (
                            <button
                              className="btn primary"
                              style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem' }}
                              onClick={() => verifyStudent(u)}
                            >
                              🔍 Verify
                            </button>
                          )}
                          {u.accountStatus !== 'suspended' && u.role !== 'admin' && (
                            <button
                              style={{
                                fontSize: '0.78rem', padding: '0.35rem 0.7rem',
                                background: '#fee2e2', color: '#dc2626',
                                border: '1px solid #fca5a5', borderRadius: 8,
                                cursor: 'pointer', fontWeight: 600,
                              }}
                              onClick={() => reject(u)}
                            >
                              🚫 Suspend
                            </button>
                          )}
                          {u.role !== 'admin' && (
                            <button
                              style={{
                                fontSize: '0.78rem', padding: '0.35rem 0.7rem',
                                background: '#dc2626', color: '#fff',
                                border: '1px solid #b91c1c', borderRadius: 8,
                                cursor: 'pointer', fontWeight: 600,
                              }}
                              onClick={() => deleteUser(u)}
                              title="Delete this user permanently"
                            >
                              🗑️ Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No users match your filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── ADD NEW USER MODAL ─────────────────────────────────── */}
      {newUser && (
        <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) setNewUser(null); }}>
          <div>
            <h2 style={{ margin: '0 0 1.25rem', fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '1.2rem' }}>
              ➕ Add New User
            </h2>
            {[
              { label: 'Full Name',              key: 'fullName',        type: 'text' },
              { label: 'University ID',          key: 'institutionalId', type: 'text' },
              { label: 'Username',               key: 'username',        type: 'text' },
              { label: 'Email',                  key: 'email',           type: 'email' },
              { label: 'Phone',                  key: 'phone',           type: 'text' },
              { label: 'Initial Password (min 6)', key: 'password',      type: 'text' },
            ].map(({ label, key, type }) => (
              <div key={key} style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem', color: '#334155' }}>{label}</label>
                <input
                  type={type}
                  value={newUser[key] || ''}
                  onChange={e => setNewUser(prev => ({ ...prev, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem', color: '#334155' }}>Role</label>
                <select
                  value={newUser.role}
                  onChange={e => setNewUser(prev => ({ ...prev, role: e.target.value }))}
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: '0.9rem' }}
                >
                  {Object.entries(ROLE_OPTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {newUser.role === 'student' && (
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem', color: '#334155' }}>Year of Study *</label>
                  <select
                    value={newUser.year}
                    onChange={e => setNewUser(prev => ({ ...prev, year: e.target.value }))}
                    style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: '0.9rem' }}
                  >
                    <option value="">— Select —</option>
                    {[1,2,3,4,5,6,7].map(y => (
                      <option key={y} value={String(y)}>Year {y}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <p className="muted" style={{ fontSize: '0.82rem' }}>
              The account is activated immediately — the user can log in with the
              username and password you set, and receives a welcome notification.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button className="btn" onClick={() => setNewUser(null)}>Cancel</button>
              <button
                className="btn primary"
                onClick={saveCreate}
                disabled={
                  !newUser.fullName.trim() || !newUser.institutionalId.trim() ||
                  !newUser.username.trim() || newUser.password.length < 6 ||
                  (newUser.role === 'student' && !newUser.year)
                }
              >
                👤 Create User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ──────────────────────────────────────────── */}
      {editingUser && (
        <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) setEditingUser(null); }}>
          <div>
            <h2 style={{ margin: '0 0 1.25rem', fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '1.2rem' }}>
              ✏️ Edit User — {editingUser.fullName}
            </h2>
            {[
              { label: 'Full Name', key: 'fullName', type: 'text' },
              { label: 'University ID', key: 'institutionalId', type: 'text' },
              { label: 'Username', key: 'username', type: 'text' },
              { label: 'Email', key: 'email', type: 'email' },
              { label: 'Phone', key: 'phone', type: 'text' },
            ].map(({ label, key, type }) => (
              <div key={key} style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem', color: '#334155' }}>{label}</label>
                <input
                  type={type}
                  value={editingUser[key] || ''}
                  onChange={e => setEditingUser(prev => ({ ...prev, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem', color: '#334155' }}>Role</label>
                <select
                  value={editingUser.role}
                  onChange={e => setEditingUser(prev => ({ ...prev, role: e.target.value }))}
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: '0.9rem' }}
                >
                  {editingUser.role === 'industrial' && (
                    <option value="industrial">🚫 Retired account</option>
                  )}
                  {Object.entries(ROLE_OPTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem', color: '#334155' }}>Account Status</label>
                <select
                  value={editingUser.accountStatus}
                  onChange={e => setEditingUser(prev => ({ ...prev, accountStatus: e.target.value }))}
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: '0.9rem' }}
                >
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button className="btn" onClick={() => setEditingUser(null)}>Cancel</button>
              <button className="btn primary" onClick={saveEdit}>💾 Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </AdminPortal>
  );
}