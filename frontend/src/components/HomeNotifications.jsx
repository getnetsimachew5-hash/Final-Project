import { useState } from 'react';

const INITIAL_NOTIFICATIONS = [
  {
    id: 1,
    title: 'TeleBirr Payment Integration Live',
    category: 'payment',
    date: '2026-09-29',
    time: '10:15 AM',
    urgent: true,
    badge: 'PAYMENT ACTIVE',
    summary: 'TeleBirr automatic payment disbursement simulation is active. Verified batches automatically send instant stipends to student mobile accounts.',
  },
  {
    id: 2,
    title: 'Batch #2026-03 Approved by Administrative VP',
    category: 'approval',
    date: '2026-09-28',
    time: '04:30 PM',
    urgent: false,
    badge: 'APPROVED',
    summary: 'The Administrative Vice President office has endorsed Batch #2026-03 (Computer Science Dept). The batch is now in Finance for payment batching.',
  },
  {
    id: 3,
    title: 'Student Return Form Deadline Notice',
    category: 'announcement',
    date: '2026-09-25',
    time: '09:00 AM',
    urgent: false,
    badge: 'ANNOUNCEMENT',
    summary: 'All final year CS students completing industrial attachment must upload company completion letters before submitting the return form.',
  },
  {
    id: 4,
    title: 'Direct Administrative VP to Finance Payment Path',
    category: 'system',
    date: '2026-09-20',
    time: '02:15 PM',
    urgent: false,
    badge: 'SYSTEM UPDATE',
    summary: 'Approved batches now move straight from the Administrative VP Office to Finance, reducing the time before TeleBirr payment.',
  }
];

export default function HomeNotifications() {
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  const filtered = filter === 'all' 
    ? INITIAL_NOTIFICATIONS 
    : INITIAL_NOTIFICATIONS.filter(n => n.category === filter);

  return (
    <section className="home-notifications-section" id="notifications">
      <div className="section-header-row">
        <div>
          <span className="live-pill">
            <span className="pulse-indicator" /> LIVE ANNOUNCEMENTS &amp; NOTIFICATIONS
          </span>
          <h2>System Updates &amp; Payment Status</h2>
        </div>

        <div className="filter-chips">
          <button 
            className={`chip-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All Updates
          </button>
          <button 
            className={`chip-btn ${filter === 'payment' ? 'active' : ''}`}
            onClick={() => setFilter('payment')}
          >
            💳 Payments
          </button>
          <button 
            className={`chip-btn ${filter === 'approval' ? 'active' : ''}`}
            onClick={() => setFilter('approval')}
          >
            🔄 Approvals
          </button>
          <button 
            className={`chip-btn ${filter === 'announcement' ? 'active' : ''}`}
            onClick={() => setFilter('announcement')}
          >
            📢 Notices
          </button>
        </div>
      </div>

      {/* Marquee Ticker */}
      <div className="notification-ticker-bar">
        <div className="ticker-label">LATEST:</div>
        <div className="ticker-content">
          <marquee speed="50" behavior="scroll" direction="left" scrollamount="6">
            🔔 <strong>TeleBirr Payment System Active</strong> &nbsp;|&nbsp; 
            📋 <strong>Sequential Approval Pipeline:</strong> CS Dept ➔ College ➔ Academic VP ➔ Admin VP ➔ Finance &nbsp;|&nbsp; 
            ⚡ Real-time complaint review by Administrative VP office enabled!
          </marquee>
        </div>
      </div>

      {/* Notification Cards Grid */}
      <div className="notif-grid">
        {filtered.map(n => (
          <article 
            key={n.id} 
            className={`notif-card ${n.urgent ? 'urgent-border' : ''}`}
          >
            <header className="notif-card-header">
              <span className={`notif-badge ${n.category}`}>
                {n.badge}
              </span>
              <span className="notif-date">{n.date} · {n.time}</span>
            </header>

            <h3 className="notif-title">{n.title}</h3>
            <p className="notif-summary">{n.summary}</p>

            {expandedId === n.id && (
              <div className="notif-details">
                <p><strong>Note for Users:</strong> All stage movements update automatically on student status dashboards. If you encounter any issue, please submit a report below.</p>
              </div>
            )}

            <button 
              className="notif-toggle-btn"
              onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}
            >
              {expandedId === n.id ? 'Show Less ▲' : 'Read Full Notice ▼'}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
