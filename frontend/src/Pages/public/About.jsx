import Layout from '../../components/Layout';

const actors = [
  { icon: '🎓', name: 'Student',              desc: 'Submits return form, uploads completion letter, tracks payment' },
  { icon: '💻', name: 'CS Department',        desc: 'Verifies students and creates payment batches' },
  { icon: '🏫', name: 'College Office',       desc: 'Reviews and approves batches' },
  { icon: '🎖️', name: 'Academic VP Office',   desc: 'Endorses academically eligible requests' },
  { icon: '⚖️', name: 'Administrative VP',    desc: 'Authorizes payment and forwards directly to Finance' },
  { icon: '💳', name: 'Finance Office',       desc: 'Processes and simulates TeleBirr payments' },
  { icon: '🔐', name: 'System Administrator', desc: 'Manages users, logs, and backups' },
];

const stack = ['React', 'Node.js', 'Express', 'MongoDB', 'JWT', 'Vite'];

const team = [
  { name: 'Yohannes Ashango', id: 'WCU1501410' },
  { name: 'Mulugeta Emiru',   id: 'WCU1501158' },
  { name: 'Simachew Getnet',  id: 'WCU1501274' },
  { name: 'Zinabu Kifle',     id: 'WCU1501446' },
];

/** "Yohannes Ashango" → "YA" for the avatar circle */
const initials = (name) =>
  name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

export default function About() {
  return (
    <Layout>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="about-hero">
        <span className="about-badge">Student Internship Payment Management System</span>
        <h1>About SIPMS</h1>
        <p className="about-lede">
          A digital six-stage workflow that replaces the 15–25 day paper journey
          for internship payments at Wachemo University.
        </p>
      </section>

      {/* ── Problem & Solution ───────────────────────────── */}
      <section className="about-section">
        <div className="about-duo">
          <article className="about-card">
            <div className="about-icon warn">❗</div>
            <h2>The Problem</h2>
            <p>
              Internship payments at Wachemo University's Computer Science
              Department currently require a paper file to physically travel
              through six approval stages — taking 15–25 days, risking loss, and giving
              students no transparency.
            </p>
          </article>
          <article className="about-card">
            <div className="about-icon">💡</div>
            <h2>Our Solution</h2>
            <p>
              SIPMS digitizes the exact six-stage workflow, adds role-based
              dashboards for every office, and simulates TeleBirr integration
              for academic demonstration.
            </p>
          </article>
        </div>
      </section>

      {/* ── Actors ───────────────────────────────────────── */}
      <section className="about-section">
        <h2 className="about-title">Seven Actors, One Digital Workflow</h2>
        <div className="about-actors">
          {actors.map(a => (
            <article className="about-actor" key={a.name}>
              <div className="about-actor-icon" aria-hidden>{a.icon}</div>
              <h3>{a.name}</h3>
              <p>{a.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Tech stack ───────────────────────────────────── */}
      <section className="about-section">
        <h2 className="about-title">Technology Stack</h2>
        <div className="about-chips">
          {stack.map(t => <span className="about-chip" key={t}>{t}</span>)}
        </div>
      </section>

      {/* ── Team ─────────────────────────────────────────── */}
      <section className="about-section">
        <h2 className="about-title">The Team</h2>
        <div className="about-team">
          {team.map(m => (
            <article className="about-member" key={m.id}>
              <div className="about-avatar" aria-hidden>{initials(m.name)}</div>
              <h3>{m.name}</h3>
              <p>{m.id}</p>
            </article>
          ))}
        </div>
        <p className="about-advisor">👨‍🏫 Advisor: <strong>Dr. Wendimu Lambamo</strong></p>
      </section>
    </Layout>
  );
}