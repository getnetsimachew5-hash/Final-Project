import { useEffect, useState } from 'react';
import api from '../api/axios';

const ACTOR_ROLES = [
  { value: 'visitor', label: '🌐 Visitor / Guest' },
  { value: 'student', label: '🎓 Student' },
  { value: 'cs_dept', label: '💻 CS Department Head' },
  { value: 'college', label: '🏫 College Dean Office' },
  { value: 'academic_vp', label: '🏛️ Academic VP' },
  { value: 'admin_vp', label: '⚖️ Administrative VP' },
  { value: 'finance', label: '💰 Finance Officer' },
  { value: 'admin', label: '⚙️ System Administrator' },
];

// Labels for posts written before an office was retired.
const LEGACY_ROLE_LABELS = {
  industrial: 'Former staff',
};

const KINDS = [
  { value: 'complaint', label: '🔴 Complaint' },
  { value: 'comment', label: '🔵 Comment' },
  { value: 'suggestion', label: '🟢 Suggestion' },
];

const CATEGORIES = [
  'General',
  'Payment Delay',
  'Document Approval',
  'System Bug',
  'Attendance Issue',
  'User Account'
];

export default function FeedbackBoard() {
  const [items, setItems] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [form, setForm] = useState({
    name: '',
    role: 'student',
    kind: 'complaint',
    category: 'General',
    message: ''
  });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);

  const load = () => {
    api.get('/feedback')
      .then(r => setItems(r.data))
      .catch(() => setErr('Could not load feedback posts'));
  };

  useEffect(() => { load(); }, []);

  const setField = key => e => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    setSending(true);
    try {
      await api.post('/feedback', form);
      setMsg('✅ Your feedback/complaint has been submitted successfully! It is now recorded on the public board.');
      setForm({ name: '', role: 'student', kind: 'complaint', category: 'General', message: '' });
      load();
    } catch (e2) {
      setErr(e2.response?.data?.message || 'Failed to submit feedback');
    } finally {
      setSending(false);
    }
  };

  const filteredItems = activeFilter === 'all'
    ? items
    : items.filter(i => i.kind === activeFilter);

  const formatRoleLabel = (roleKey) => {
    const found = ACTOR_ROLES.find(r => r.value === roleKey);
    return found ? found.label : (LEGACY_ROLE_LABELS[roleKey] || roleKey);
  };

  return (
    <section className="feedback-section" id="feedback">
      <div className="feedback-header">
        <div>
          <span className="section-pill">PUBLIC AUDIT &amp; FEEDBACK</span>
          <h2>📣 Actor Complaint &amp; Feedback System</h2>
          <p className="muted">
            All system actors (Students, Department Heads, Deans, Vice Presidents, Finance, &amp; Visitors) 
            can submit complaints, suggestions, or comments directly.
          </p>
        </div>

        {/* Filter buttons */}
        <div className="fb-filter-bar">
          <button 
            className={`fb-tab ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            All Posts ({items.length})
          </button>
          <button 
            className={`fb-tab ${activeFilter === 'complaint' ? 'active' : ''}`}
            onClick={() => setActiveFilter('complaint')}
          >
            Complaints ({items.filter(i => i.kind === 'complaint').length})
          </button>
          <button 
            className={`fb-tab ${activeFilter === 'suggestion' ? 'active' : ''}`}
            onClick={() => setActiveFilter('suggestion')}
          >
            Suggestions ({items.filter(i => i.kind === 'suggestion').length})
          </button>
        </div>
      </div>

      <form className="feedback-form" onSubmit={submit}>
        <h3>Submit a Complaint or Comment</h3>
        
        <div className="feedback-row-grid">
          <div>
            <label htmlFor="fb-name">Your Name (Optional)</label>
            <input
              id="fb-name"
              placeholder="e.g. Abebe Bikila (or leave blank for Anonymous)"
              value={form.name}
              onChange={setField('name')}
              maxLength={80}
            />
          </div>

          <div>
            <label htmlFor="fb-role">Select Your Role / Actor Type</label>
            <select id="fb-role" value={form.role} onChange={setField('role')}>
              {ACTOR_ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="fb-kind">Post Type</label>
            <select id="fb-kind" value={form.kind} onChange={setField('kind')}>
              {KINDS.map(k => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="fb-category">Category</label>
            <select id="fb-category" value={form.category} onChange={setField('category')}>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="fb-message">Message Details</label>
          <textarea
            id="fb-message"
            placeholder="Describe your complaint, inquiry, or suggestion in detail..."
            value={form.message}
            onChange={setField('message')}
            maxLength={1000}
            required
          />
        </div>

        {err && <div className="error">{err}</div>}
        {msg && <div className="success">{msg}</div>}

        <button className="btn primary" type="submit" disabled={sending}>
          {sending ? 'Sending Post…' : 'Submit Post Publicly'}
        </button>
      </form>

      {/* Posted Feedback List */}
      <div className="feedback-list">
        <h3>Recent Posts &amp; Responses</h3>
        {filteredItems.length === 0 ? (
          <p className="muted">No posts found under this filter.</p>
        ) : (
          filteredItems.map(i => (
            <article key={i._id} className={`feedback-card kind-${i.kind}`}>
              <header className="fb-card-header">
                <div className="fb-card-tags">
                  <span className={`fb-kind-badge kind-${i.kind}`}>
                    {i.kind.toUpperCase()}
                  </span>
                  <span className="fb-role-badge">
                    {formatRoleLabel(i.role)}
                  </span>
                  {i.category && (
                    <span className="fb-category-badge">
                      🏷️ {i.category}
                    </span>
                  )}
                </div>
                <time className="fb-time">
                  {new Date(i.createdAt).toLocaleDateString()} at {new Date(i.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </time>
              </header>

              <div className="fb-author">
                <strong>{i.name || 'Anonymous User'}</strong>
              </div>

              <p className="fb-message-text">{i.message}</p>

              {i.reply ? (
                <div className="fb-official-reply">
                  <div className="reply-header">
                    <strong>⚖️ Official Response from {i.repliedBy?.fullName || 'Administrative VP Office'}:</strong>
                  </div>
                  <p>{i.reply}</p>
                </div>
              ) : (
                <div className="fb-pending-reply">
                  <em>⏳ Pending review by system administration.</em>
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
