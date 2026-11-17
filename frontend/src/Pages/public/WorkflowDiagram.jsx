import { useState } from 'react';
import Layout from '../../components/Layout';
import '../../styles.css';

/* ─── Actor data ──────────────────────────────────────────────── */
const ACTORS = [
  {
    id: 'student',
    step: 1,
    icon: '🎓',
    title: 'Internship Student',
    color: '#059669',
    light: '#ecfdf5',
    border: '#6ee7b7',
    role: 'Starts the process by submitting internship information and required documents to prove completion.',
    action: 'Submit internship information',
    functions: [
      'Register account & Login',
      'Complete internship return form',
      'Enter internship organization information',
      'Enter supervisor information',
      'Enter internship start & end dates',
      'Upload internship completion letter',
      'Submit internship information',
      'Track submission & payment status',
      'Receive notifications',
      'View payment history',
    ],
    sequence: ['Register', 'Login', 'Complete Return Form', 'Enter Organization', 'Enter Supervisor', 'Enter Start/End Dates', 'Upload Completion Letter', 'Submit', 'Wait for Verification', 'Track Status → Receive Payment'],
    output: 'Student information, Organization info, Supervisor info, Internship dates, Completion letter',
  },
  {
    id: 'cs-dept',
    step: 2,
    icon: '💻',
    title: 'CS Department',
    color: '#2563eb',
    light: '#eff6ff',
    border: '#93c5fd',
    role: 'First institutional processing actor. Checks the student\'s submission and prepares the payment request.',
    action: 'Verify & create payment request',
    functions: [
      'View student internship submissions',
      'Verify required information',
      'Identify eligible students',
      'Register eligible students into payment batches',
      'Create & edit payment-request lists',
      'Cancel incorrect requests',
      'Forward payment requests to College',
      'Monitor & correct rejected requests',
    ],
    sequence: ['Login', 'View Student Submissions', 'Check Info & Eligibility', 'Add to Payment Batch', 'Create Payment Request', 'Edit if Necessary', 'Confirm & Forward to College'],
    output: 'Verified payment request batch forwarded to College Office',
  },
  {
    id: 'college',
    step: 3,
    icon: '🏫',
    title: 'College Office',
    color: '#7c3aed',
    light: '#f5f3ff',
    border: '#c4b5fd',
    role: 'Performs the first formal institutional review of documents and payment requests.',
    action: 'Formal document review & approve',
    functions: [
      'View CS Department requests',
      'Review student documents & completion letter',
      'Verify request completeness',
      'Approve or reject request',
      'Enter rejection comments',
      'Forward approved request to Academic VP',
      'Monitor previous requests',
    ],
    sequence: ['Login', 'View CS Dept Request', 'Review Documents & Letter', 'Check Completeness', 'Approve → Forward to Academic VP', 'OR Reject + Comment → Return for Correction'],
    output: 'Approved request forwarded to Academic VP Office',
  },
  {
    id: 'academic-vp',
    step: 4,
    icon: '🎖️',
    title: 'Academic VP Office',
    color: '#0891b2',
    light: '#ecfeff',
    border: '#67e8f9',
    role: 'Verifies academic eligibility and endorses the payment request for administrative processing.',
    action: 'Verify academic eligibility',
    functions: [
      'View College-approved requests',
      'Review academic eligibility',
      'Review supporting documents',
      'Endorse eligible request',
      'Reject if requirements not satisfied',
      'Provide rejection comments',
      'Forward endorsed request to Administrative VP',
      'Monitor processed requests',
    ],
    sequence: ['Login', 'View College-Approved Request', 'Review Academic Eligibility', 'Review Supporting Docs', 'Eligible? → Endorse → Admin VP', 'OR Reject + Comment → Previous Actor'],
    output: 'Academically endorsed request forwarded to Administrative VP',
  },
  {
    id: 'admin-vp',
    step: 5,
    icon: '⚖️',
    title: 'Administrative VP',
    color: '#b45309',
    light: '#fffbeb',
    border: '#fcd34d',
    role: 'Provides administrative authorization and budget confirmation, then hands the batch directly to Finance.',
    action: 'Administrative authorization',
    functions: [
      'View academically endorsed requests',
      'Review administrative requirements',
      'Confirm payment availability/authorization',
      'Approve or reject request',
      'Add comments',
      'Forward approved request directly to Finance',
      'View approval history',
    ],
    sequence: ['Login', 'View Academic VP Approved Request', 'Review Admin Requirements', 'Confirm Payment Authorization', 'Approve → Finance', 'OR Reject + Comment → Correction'],
    output: 'Administratively authorized request forwarded directly to Finance',
  },
  {
    id: 'finance',
    step: 6,
    icon: '💳',
    title: 'Finance Office',
    color: '#15803d',
    light: '#f0fdf4',
    border: '#86efac',
    role: 'Final payment-processing actor. Simulates TeleBirr payment and marks requests as PAID.',
    action: 'Process payment via TeleBirr',
    functions: [
      'View approved payment requests',
      'Review & confirm payment information',
      'Calculate/confirm payment amount',
      'Process individual payment',
      'Process batch payment',
      'Simulate TeleBirr payment',
      'Generate payment reference',
      'Confirm successful payment',
      'Change request status to PAID',
      'Generate payment reports & maintain history',
    ],
    sequence: ['Login', 'View Admin VP Authorized Request', 'Review Payment Info', 'Calculate/Confirm Amount', 'Individual or Batch?', 'Simulate TeleBirr', 'Generate Reference', 'Confirm Payment', 'STATUS = PAID → Notify Student'],
    output: 'Payment confirmed. Student receives TeleBirr notification. Status = PAID.',
  },
];

/* ─── Component ───────────────────────────────────────────────── */
export default function WorkflowDiagram() {
  const [expanded, setExpanded] = useState(null);

  return (
    <Layout>
      <main className="sipms-main">
        {/* ── Page Header ── */}
        <div className="wf-page-header">
          <span className="wf-pill">📋 System Architecture</span>
          <h1 className="wf-title">6-Stage Internship Payment Workflow</h1>
          <p className="wf-subtitle">
            Complete end-to-end pipeline from student submission to TeleBirr payment —
            all six stages connected in sequence with full role functions and data flows.
          </p>
        </div>

        {/* ── Flow Diagram ── */}
        <section className="wf-diagram-section">
          <div className="wf-diagram-wrapper">
            {ACTORS.map((actor, idx) => (
              <div key={actor.id} className="wf-actor-block">
                {/* ── Actor Card ── */}
                <div
                  className={`wf-actor-card ${expanded === actor.id ? 'wf-actor-card--open' : ''}`}
                  style={{ '--actor-color': actor.color, '--actor-light': actor.light, '--actor-border': actor.border }}
                  onClick={() => setExpanded(expanded === actor.id ? null : actor.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setExpanded(expanded === actor.id ? null : actor.id)}
                  aria-expanded={expanded === actor.id}
                >
                  <div className="wf-actor-left">
                    <div className="wf-step-badge" style={{ background: actor.color }}>
                      {actor.step}
                    </div>
                    <div className="wf-actor-icon">{actor.icon}</div>
                    <div className="wf-actor-info">
                      <span className="wf-actor-name">{actor.title}</span>
                      <span className="wf-actor-action">{actor.action}</span>
                    </div>
                  </div>
                  <div className="wf-actor-right">
                    <span className="wf-fn-count">{actor.functions.length} functions</span>
                    <span className="wf-expand-icon">{expanded === actor.id ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* ── Expanded Detail Panel ── */}
                {expanded === actor.id && (
                  <div className="wf-detail-panel" style={{ '--actor-color': actor.color, '--actor-light': actor.light }}>
                    <div className="wf-detail-grid">
                      {/* Role */}
                      <div className="wf-detail-card">
                        <h4 className="wf-detail-heading">🧭 Role</h4>
                        <p className="wf-detail-text">{actor.role}</p>
                      </div>

                      {/* Functions */}
                      <div className="wf-detail-card">
                        <h4 className="wf-detail-heading">⚙️ Functions</h4>
                        <ol className="wf-fn-list">
                          {actor.functions.map((fn, i) => (
                            <li key={i} className="wf-fn-item">
                              <span className="wf-fn-num">{i + 1}</span>
                              {fn}
                            </li>
                          ))}
                        </ol>
                      </div>

                      {/* Sequence */}
                      <div className="wf-detail-card">
                        <h4 className="wf-detail-heading">🔄 Sequence</h4>
                        <div className="wf-seq-list">
                          {actor.sequence.map((step, i) => (
                            <div key={i} className="wf-seq-item">
                              <span className="wf-seq-dot" style={{ background: actor.color }} />
                              <span className="wf-seq-label">{step}</span>
                              {i < actor.sequence.length - 1 && <span className="wf-seq-arrow">↓</span>}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Output */}
                      <div className="wf-detail-card wf-output-card">
                        <h4 className="wf-detail-heading">📤 Output to Next Stage</h4>
                        <p className="wf-output-text">{actor.output}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Connector Arrow (between actors) ── */}
                {idx < ACTORS.length - 1 && (
                  <div className="wf-connector">
                    <div className="wf-connector-line" />
                    <div className="wf-connector-arrow">▼</div>
                    <div className="wf-connector-label">{ACTORS[idx + 1].action}</div>
                  </div>
                )}
              </div>
            ))}

            {/* ── PAID Terminal Node ── */}
            <div className="wf-paid-node">
              <div className="wf-paid-inner">
                <span className="wf-paid-icon">✅</span>
                <span className="wf-paid-label">PAID</span>
                <p className="wf-paid-sub">Student receives TeleBirr notification</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── System Interaction Summary ── */}
        <section className="wf-summary-section">
          <h2 className="wf-summary-title">Complete System Interaction</h2>
          <p className="muted" style={{ textAlign: 'center', marginBottom: '2rem' }}>
            The most important sequence — how all 7 actors pass data end-to-end.
          </p>
          <div className="wf-timeline">
            {ACTORS.map((actor, idx) => (
              <div key={actor.id} className="wf-timeline-item">
                <div className="wf-tl-icon" style={{ background: actor.color }}>{actor.icon}</div>
                <div className="wf-tl-content">
                  <div className="wf-tl-title" style={{ color: actor.color }}>{actor.title}</div>
                  <div className="wf-tl-desc">{actor.action}</div>
                </div>
                {idx < ACTORS.length - 1 && <div className="wf-tl-arrow">→</div>}
              </div>
            ))}
            <div className="wf-tl-paid">
              <div className="wf-tl-icon" style={{ background: '#15803d' }}>✅</div>
              <div className="wf-tl-content">
                <div className="wf-tl-title" style={{ color: '#15803d' }}>PAID</div>
                <div className="wf-tl-desc">Student receives payment & notification</div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Scoped Styles ── */}
      <style>{`
        /* ── Page Header ─────────────────────────────────── */
        .wf-page-header {
          text-align: center;
          padding: 2.5rem 1rem 2rem;
        }
        .wf-pill {
          display: inline-block;
          background: var(--primary-100);
          color: var(--primary-800);
          font-family: 'Inter', sans-serif;
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          padding: 0.3rem 0.85rem;
          border-radius: 999px;
          margin-bottom: 0.85rem;
        }
        .wf-title {
          font-family: 'Outfit', sans-serif;
          font-size: clamp(1.8rem, 4vw, 2.6rem);
          font-weight: 900;
          color: var(--ink-950);
          letter-spacing: -0.04em;
          margin: 0 0 0.75rem;
        }
        .wf-subtitle {
          font-family: 'Inter', sans-serif;
          font-size: clamp(0.95rem, 2vw, 1.08rem);
          color: var(--ink-600);
          max-width: 64ch;
          margin: 0 auto;
          line-height: 1.7;
        }

        /* ── Diagram Section ─────────────────────────────── */
        .wf-diagram-section {
          margin-bottom: 3.5rem;
        }
        .wf-diagram-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
          max-width: 820px;
          margin: 0 auto;
        }
        .wf-actor-block {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        /* ── Actor Card ──────────────────────────────────── */
        .wf-actor-card {
          width: 100%;
          background: #ffffff;
          border: 2px solid var(--actor-border);
          border-left: 5px solid var(--actor-color);
          border-radius: 14px;
          padding: 1.1rem 1.4rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
          user-select: none;
        }
        .wf-actor-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.12);
          background: var(--actor-light);
        }
        .wf-actor-card--open {
          border-radius: 14px 14px 0 0;
          background: var(--actor-light);
          box-shadow: 0 8px 24px rgba(0,0,0,0.12);
        }
        .wf-actor-left {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .wf-step-badge {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-family: 'Outfit', sans-serif;
          font-size: 0.9rem;
          font-weight: 800;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .wf-actor-icon {
          font-size: 1.7rem;
          flex-shrink: 0;
        }
        .wf-actor-info {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }
        .wf-actor-name {
          font-family: 'Outfit', sans-serif;
          font-size: 1.05rem;
          font-weight: 800;
          color: var(--ink-950);
          letter-spacing: -0.02em;
        }
        .wf-actor-action {
          font-family: 'Inter', sans-serif;
          font-size: 0.82rem;
          color: var(--ink-500);
          font-weight: 500;
        }
        .wf-actor-right {
          display: flex;
          align-items: center;
          gap: 0.85rem;
        }
        .wf-fn-count {
          font-family: 'Inter', sans-serif;
          font-size: 0.78rem;
          font-weight: 600;
          background: var(--actor-light);
          color: var(--actor-color);
          padding: 0.2rem 0.65rem;
          border-radius: 999px;
          border: 1px solid var(--actor-border);
        }
        .wf-expand-icon {
          font-size: 0.78rem;
          color: var(--ink-400);
        }

        /* ── Detail Panel ────────────────────────────────── */
        .wf-detail-panel {
          width: 100%;
          background: var(--actor-light);
          border: 2px solid var(--actor-border);
          border-top: none;
          border-radius: 0 0 14px 14px;
          padding: 1.5rem;
          animation: wfSlideDown 0.25s ease;
        }
        @keyframes wfSlideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .wf-detail-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 1rem;
        }
        .wf-detail-card {
          background: rgba(255,255,255,0.85);
          border: 1px solid var(--actor-border);
          border-radius: 10px;
          padding: 1.05rem 1.15rem;
        }
        .wf-detail-heading {
          font-family: 'Outfit', sans-serif;
          font-size: 0.88rem;
          font-weight: 800;
          color: var(--actor-color);
          letter-spacing: 0.03em;
          text-transform: uppercase;
          margin: 0 0 0.75rem;
        }
        .wf-detail-text {
          font-family: 'Inter', sans-serif;
          font-size: 0.9rem;
          color: var(--ink-700);
          line-height: 1.65;
          margin: 0;
        }

        /* Functions list */
        .wf-fn-list {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .wf-fn-item {
          font-family: 'Inter', sans-serif;
          font-size: 0.86rem;
          color: var(--ink-800);
          display: flex;
          align-items: flex-start;
          gap: 0.55rem;
          line-height: 1.5;
        }
        .wf-fn-num {
          min-width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--actor-color);
          color: #fff;
          font-size: 0.72rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 1px;
        }

        /* Sequence list */
        .wf-seq-list {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .wf-seq-item {
          display: flex;
          align-items: flex-start;
          gap: 0.55rem;
          flex-direction: column;
        }
        .wf-seq-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          flex-shrink: 0;
          margin-top: 4px;
          display: none;
        }
        .wf-seq-label {
          font-family: 'Inter', sans-serif;
          font-size: 0.87rem;
          color: var(--ink-800);
          padding: 0.3rem 0.65rem;
          background: rgba(255,255,255,0.75);
          border-radius: 6px;
          border-left: 3px solid var(--actor-color);
          width: 100%;
        }
        .wf-seq-arrow {
          font-size: 0.85rem;
          color: var(--actor-color);
          margin-left: 0.7rem;
          font-weight: 700;
        }

        /* Output card */
        .wf-output-card {
          grid-column: 1 / -1;
        }
        .wf-output-text {
          font-family: 'Inter', sans-serif;
          font-size: 0.9rem;
          color: var(--ink-700);
          line-height: 1.65;
          margin: 0;
          font-style: italic;
        }

        /* ── Connector ───────────────────────────────────── */
        .wf-connector {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
          padding: 0.1rem 0;
          position: relative;
        }
        .wf-connector-line {
          width: 2px;
          height: 30px;
          background: linear-gradient(180deg, #cbd5e1, #94a3b8);
        }
        .wf-connector-arrow {
          font-size: 0.9rem;
          color: var(--ink-400);
          line-height: 1;
          animation: wfBounce 1.8s ease-in-out infinite;
        }
        @keyframes wfBounce {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(4px); }
        }
        .wf-connector-label {
          font-family: 'Inter', sans-serif;
          font-size: 0.73rem;
          font-weight: 600;
          color: var(--ink-400);
          letter-spacing: 0.01em;
          background: #f1f5f9;
          padding: 0.18rem 0.65rem;
          border-radius: 999px;
          border: 1px solid var(--ink-200);
          white-space: nowrap;
          margin: 0.2rem 0;
        }

        /* ── PAID Terminal Node ─────────────────────────── */
        .wf-paid-node {
          margin-top: 0.5rem;
          width: 100%;
          display: flex;
          justify-content: center;
        }
        .wf-paid-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.35rem;
          background: linear-gradient(135deg, #064e3b, #059669);
          color: #fff;
          border-radius: 16px;
          padding: 1.5rem 3rem;
          box-shadow: 0 8px 30px rgba(5,150,105,0.35);
          animation: wfPaidPulse 3s ease-in-out infinite;
        }
        @keyframes wfPaidPulse {
          0%, 100% { box-shadow: 0 8px 30px rgba(5,150,105,0.35); }
          50%       { box-shadow: 0 12px 40px rgba(5,150,105,0.55); }
        }
        .wf-paid-icon { font-size: 2.2rem; }
        .wf-paid-label {
          font-family: 'Outfit', sans-serif;
          font-size: 1.85rem;
          font-weight: 900;
          letter-spacing: 4px;
        }
        .wf-paid-sub {
          font-family: 'Inter', sans-serif;
          font-size: 0.87rem;
          opacity: 0.85;
          margin: 0;
        }

        /* ── Summary Timeline ───────────────────────────── */
        .wf-summary-section {
          background: #ffffff;
          border: 1px solid var(--ink-200);
          border-radius: 18px;
          padding: 2.5rem 2rem;
          box-shadow: 0 4px 20px rgba(0,0,0,0.06);
          margin-bottom: 3rem;
        }
        .wf-summary-title {
          font-family: 'Outfit', sans-serif;
          font-size: clamp(1.35rem, 2.5vw, 1.65rem);
          font-weight: 900;
          text-align: center;
          color: var(--ink-950);
          letter-spacing: -0.03em;
          margin: 0 0 0.5rem;
        }
        .wf-timeline {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          margin-top: 0;
        }
        .wf-timeline-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .wf-tl-icon {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.15rem;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .wf-tl-content {
          display: flex;
          flex-direction: column;
        }
        .wf-tl-title {
          font-family: 'Outfit', sans-serif;
          font-size: 0.82rem;
          font-weight: 800;
          letter-spacing: -0.01em;
        }
        .wf-tl-desc {
          font-family: 'Inter', sans-serif;
          font-size: 0.72rem;
          color: var(--ink-500);
          max-width: 90px;
          line-height: 1.35;
        }
        .wf-tl-arrow {
          font-size: 1.1rem;
          color: var(--ink-300);
          font-weight: 700;
          margin: 0 0.1rem;
        }
        .wf-tl-paid {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        /* ── Responsive: compact block arrangement ───────── */
        @media (max-width: 768px) {
          .wf-page-header { padding: 1.75rem 0.5rem 1.5rem; }
          .wf-diagram-wrapper { max-width: 100%; }
          .wf-actor-card { padding: 0.85rem 0.9rem; gap: 0.6rem; align-items: flex-start; }
          .wf-actor-left { gap: 0.6rem; min-width: 0; }
          .wf-step-badge { width: 26px; height: 26px; font-size: 0.78rem; }
          .wf-actor-icon { font-size: 1.35rem; }
          .wf-actor-info { min-width: 0; }
          .wf-actor-name { font-size: 0.94rem; overflow-wrap: anywhere; }
          .wf-actor-action { font-size: 0.74rem; overflow-wrap: anywhere; }
          .wf-actor-right { gap: 0.4rem; flex-shrink: 0; }
          .wf-fn-count { display: none; }
          .wf-detail-panel { padding: 0.9rem; }
          .wf-detail-grid { grid-template-columns: 1fr; gap: 0.7rem; }
          .wf-detail-card { padding: 0.85rem 0.9rem; min-width: 0; }
          .wf-detail-heading { font-size: 0.78rem; margin-bottom: 0.55rem; }
          .wf-detail-text, .wf-output-text { font-size: 0.84rem; }

          /* Every function row stays visible: compact 1-column block list,
             never a fixed height / hidden overflow. */
          .wf-fn-list { max-height: none; overflow: visible; gap: 0.3rem; }
          .wf-fn-item {
            font-size: 0.82rem;
            line-height: 1.4;
            gap: 0.45rem;
            min-width: 0;
            overflow-wrap: anywhere;
            white-space: normal;
          }
          .wf-fn-num { min-width: 19px; width: 19px; height: 19px; font-size: 0.65rem; }

          .wf-seq-label { font-size: 0.82rem; padding: 0.28rem 0.55rem; overflow-wrap: anywhere; }
          .wf-connector-label { font-size: 0.68rem; white-space: normal; text-align: center; }
          .wf-paid-inner { padding: 1.1rem 1.5rem; }
          .wf-paid-label { font-size: 1.45rem; letter-spacing: 2px; }
          .wf-paid-sub { font-size: 0.78rem; text-align: center; }
          .wf-summary-section { padding: 1.4rem 1rem; }
          .wf-timeline { flex-direction: column; align-items: stretch; gap: 0.45rem; }
          .wf-timeline-item { flex-direction: row; align-items: flex-start; }
          .wf-tl-desc { max-width: none; }
          .wf-tl-arrow { transform: rotate(90deg); margin: 0 auto; }
        }

        @media (max-width: 480px) {
          .wf-actor-card { padding: 0.75rem 0.8rem; }
          .wf-actor-icon { font-size: 1.2rem; }
          .wf-actor-name { font-size: 0.88rem; }
          .wf-actor-action { font-size: 0.7rem; }
          .wf-detail-panel { padding: 0.7rem; }
          .wf-detail-grid { gap: 0.6rem; }
          .wf-detail-card { padding: 0.75rem 0.8rem; }
          .wf-fn-item { font-size: 0.78rem; gap: 0.4rem; }
          .wf-fn-num { min-width: 17px; width: 17px; height: 17px; font-size: 0.6rem; }
          .wf-seq-label { font-size: 0.78rem; }
          .wf-paid-inner { padding: 1rem 1.1rem; width: 100%; }
        }
      `}</style>
    </Layout>
  );
}
