import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import './Home.css';

const STAGES = [
  {
    step: '01',
    icon: '📝',
    title: 'Student Submission',
    desc: 'Students submit internship return forms and upload completion letters online.',
  },
  {
    step: '02',
    icon: '💻',
    title: 'CS Dept Verification',
    desc: 'Department verifies documents, creates payment batches, and forwards to College.',
  },
  {
    step: '03',
    icon: '🏫',
    title: 'College Office Review',
    desc: 'The College Office reviews the documents and forwards the batch to the Academic VP.',
  },
  {
    step: '04',
    icon: '🎖️',
    title: 'Academic VP Endorsement',
    desc: 'The Academic VP confirms academic eligibility and endorses the batch.',
  },
  {
    step: '05',
    icon: '⚖️',
    title: 'Admin VP Authorization',
    desc: 'The Administrative VP authorizes the budget and forwards directly to Finance.',
  },
  {
    step: '06',
    icon: '💳',
    title: 'Finance & TeleBirr',
    desc: 'Finance processes payments and sends money via TeleBirr to student phones.',
  },
];

// All actors with a link to each portal (dashboard) page
const ACTOR_PAGES = [
  { name: 'Student',                desc: 'Submit forms & track status',       to: '/student'     },
  { name: 'CS Department',          desc: 'Verify submissions & create batches', to: '/cs-dept'   },
  { name: 'College',                desc: 'Review documents & forward to Academic VP', to: '/college' },
  { name: 'Academic VP',            desc: 'Check academic eligibility',          to: '/academic-vp' },
  { name: 'Administrative VP',      desc: 'Authorize payment & forward to Finance', to: '/admin-vp'  },
  { name: 'Finance',                desc: 'Process payments via TeleBirr',       to: '/finance'   },
  { name: 'System Admin',           desc: 'Manage users, roles & audit logs',    to: '/admin'     },
];

const ACTORS = [
  { name: 'Student', desc: 'Submit forms & track status' },
  { name: 'CS Department', desc: 'Verify & create batches' },
  { name: 'College', desc: 'Review documents' },
  { name: 'Academic VP', desc: 'Academic eligibility' },
  { name: 'Admin VP', desc: 'Authorize payment' },
  { name: 'Finance', desc: 'Pay via TeleBirr' },
  { name: 'Admin', desc: 'Manage the system' },
];

export default function Home() {
  return (
    <div className="home-page">
      {/* ========== GLOBAL NAVBAR (same as every other page) ==========
          Uses components/Navbar → university logo image, green theme,
          Home/About/Workflow links, Portals dropdown, Login/Register
          and a working hamburger menu on small screens. */}
      <Navbar />

      {/* ========== HERO ========== */}
      <section className="hero">
        <div className="hero-content">
          <span className="hero-badge">Student Internship Payment System</span>
          <h1>Student Internship Payment Management System</h1>
          <p className="hero-desc">
            A web-based system developed for <strong>Wachemo University</strong> to manage
            internship stipend payments in a transparent, fast, and accountable way.
          </p>
          <div className="hero-actions">
            <Link to="/register" className="btn primary">Student Registration</Link>
            <Link to="/login" className="btn secondary">Portal Login</Link>
            <Link to="/workflow" className="btn ghost">View Workflow</Link>
          </div>
        </div>
      </section>

      {/* ========== ABOUT PROJECT (3 articles) ========== */}
      <section className="about-section">
        <div className="about-inner">
          <h2>About This Project</h2>
          <p className="about-lead">
            The <strong>Student Internship Payment Management System (SIPMS)</strong> is a
            web-based platform built for <strong>Wachemo University</strong> to manage
            internship stipend payments in a transparent, fast and accountable way.
          </p>

          {/* 3 articles — inline row on desktop/tablet, stacked blocks on phones */}
          <div className="about-articles">
            <article className="about-article">
              <div className="about-article-head">
                <span className="about-article-num">01</span>
                <span className="about-article-icon" aria-hidden="true">🕒</span>
              </div>
              <h3 className="about-article-title">The Problem</h3>
              <p className="about-article-text">
                The old process was fully paper-based. Students waited a long time for their
                stipend, had no way to know where their request was, and had to visit several
                offices again and again just to follow up.
              </p>
            </article>

            <article className="about-article">
              <div className="about-article-head">
                <span className="about-article-num">02</span>
                <span className="about-article-icon" aria-hidden="true">⚡</span>
              </div>
              <h3 className="about-article-title">The Digital Solution</h3>
              <p className="about-article-text">
                Every step now happens online: students submit the return form and upload the
                completion letter, the CS Department verifies and batches requests, then College,
                Academic VP and Admin VP approve. The Admin VP forwards directly to Finance,
                which pays the approved amount through <strong>TeleBirr</strong>.
              </p>
            </article>

            <article className="about-article">
              <div className="about-article-head">
                <span className="about-article-num">03</span>
                <span className="about-article-icon" aria-hidden="true">👥</span>
              </div>
              <h3 className="about-article-title">Who Uses It</h3>
              <p className="about-article-text">
                The system uses role-based access for Students, CS Department, College Office,
                Academic VP, Admin VP, Finance and System Admin. Each role has
                its own portal, its own responsibilities, live status tracking and notifications.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* ========== STAGES ========== */}
      <section className="stages-section">
        <div className="section-header">
          <h2>Six-Stage Approval Pipeline</h2>
          <p>From student submission to TeleBirr payment — every step is tracked.</p>
        </div>

        <div className="stages-grid">
          {STAGES.map((s) => (
            <div className="stage-card" key={s.step}>
              <div className="stage-top">
                <span className="stage-num">{s.step}</span>
                <span className="stage-icon">{s.icon}</span>
              </div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ========== ACTORS ========== */}
      <section className="actors-section">
        <div className="section-header">
          <h2>Who Uses SIPMS?</h2>
          <p>Every role has a dedicated portal with clear responsibilities.</p>
        </div>

        <div className="actors-grid">
          {ACTORS.map((a) => (
            <div className="actor-card" key={a.name}>
              <h4>{a.name}</h4>
              <p>{a.desc}</p>
            </div>
          ))}
        </div>

        {/* Bullet list: every actor and the page (portal) they use */}
        <ul className="actors-bullet-list">
          <li className="actors-bullet-title">All Actors &amp; Their Pages</li>
          {ACTOR_PAGES.map((a) => (
            <li key={a.to}>
              <Link className="actor-bullet-link" to={a.to}>
                <b>{a.name}</b> — {a.desc}
                <span className="actor-page">&nbsp;&rarr; visit page ({a.to})</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ========== BENEFITS ========== */}
      <section className="benefits-section">
        <div className="section-header">
          <h2>Why This System Matters</h2>
          <p>Main benefits for students and the university.</p>
        </div>
        <div className="benefits-grid">
          <div className="benefit-card">
            <h4>Faster Payments</h4>
            <p>Automated workflows reduce delays so students receive stipends on time.</p>
          </div>
          <div className="benefit-card">
            <h4>Full Transparency</h4>
            <p>Students can track their request status online at every stage.</p>
          </div>
          <div className="benefit-card">
            <h4>Less Paperwork</h4>
            <p>Digital forms and documents replace manual paper files and spreadsheets.</p>
          </div>
          <div className="benefit-card">
            <h4>Secure Payments</h4>
            <p>Approved amounts are paid via TeleBirr to the student’s registered phone number.</p>
          </div>
        </div>
      </section>

      {/* ========== CTA ========== */}
      <section className="cta-section">
        <div className="cta-box">
          <h2>Ready to get started?</h2>
          <p>Students can register now. Staff can log in to their portals.</p>
          <div className="cta-actions">
            <Link to="/register" className="btn primary">Register as Student</Link>
            <Link to="/login" className="btn secondary">Staff / Portal Login</Link>
          </div>
        </div>
      </section>

      {/* ========== FOOTER (shared, identical on every page) ========== */}
      <Footer />
    </div>
  );
}