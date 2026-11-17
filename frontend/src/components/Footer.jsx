import { Link } from 'react-router-dom';

const publicLinks = [
  { to: '/',          label: 'Home' },
  { to: '/about',     label: 'About' },
  { to: '/workflow',  label: 'Workflow' },
  { to: '/login',     label: 'Login' },
  { to: '/register',  label: 'Register' },
];

const portalLinks = [
  { to: '/student',              label: 'Student Portal' },
  { to: '/cs-dept',              label: 'CS Department Portal' },
  { to: '/college',              label: 'College Portal' },
  { to: '/academic-vp',          label: 'Academic VP Portal' },
  { to: '/admin-vp',             label: 'Administrative VP Portal' },
  { to: '/finance',              label: 'Finance Portal' },
  { to: '/admin',                label: 'Admin Portal' },
];

const quickLinks = [
  { to: '/student/return',         label: 'Internship Return Form' },
  { to: '/student/upload',         label: 'Upload Completion Letter' },
  { to: '/student/status',         label: 'Payment Status' },
  { to: '/finance/individual',     label: 'Individual Payment' },
  { to: '/finance/batch',          label: 'Batch Payment' },
  { to: '/admin/users',            label: 'User Approvals' },
];

/* Where the system is deployed / who to contact */
const LOCATION = {
  university: 'Wachemo University',
  campus: 'Main Campus, Hosanna',
  zone: 'Hadiya Zone, Central Ethiopia',
  country: 'Ethiopia',
  email: 'ict@wcu.edu.et',
  phone: '+251-46-887-0000',
  hours: 'Mon – Fri · 8:30 AM – 5:00 PM',
};

export default function Footer() {
  return (
    <footer className="sipms-footer">
      <div className="cols">
        {/* Brand + location summary */}
        <div className="brand">
          <h4>SIPMS</h4>
          <p>Student Internship Payment Management System</p>
          <p>Wachemo University — College of Engineering &amp; Technology</p>
          <p className="footer-location">
            <span className="footer-ico" aria-hidden="true">📍</span>
            <span>{LOCATION.campus}, {LOCATION.country}</span>
          </p>
        </div>

        <div>
          <h4>Public Pages</h4>
          <ul>
            {publicLinks.map(l => (
              <li key={l.to}><Link to={l.to}>{l.label}</Link></li>
            ))}
          </ul>
        </div>

        <div>
          <h4>Portals</h4>
          <ul>
            {portalLinks.map(l => (
              <li key={l.to}><Link to={l.to}>{l.label}</Link></li>
            ))}
          </ul>
        </div>

        <div>
          <h4>Quick Links</h4>
          <ul>
            {quickLinks.map(l => (
              <li key={l.to}><Link to={l.to}>{l.label}</Link></li>
            ))}
          </ul>
        </div>

        {/* System location & contact */}
        <div className="footer-contact">
          <h4>Location &amp; Contact</h4>
          <p className="footer-location footer-address">
            <span className="footer-ico" aria-hidden="true">📍</span>
            <span>
              <strong>{LOCATION.university}</strong><br />
              {LOCATION.campus}<br />
              {LOCATION.zone}<br />
              {LOCATION.country}
            </span>
          </p>
          <p className="footer-location">
            <span className="footer-ico" aria-hidden="true">✉️</span>
            <a href={`mailto:${LOCATION.email}`}>{LOCATION.email}</a>
          </p>
          <p className="footer-location">
            <span className="footer-ico" aria-hidden="true">📞</span>
            <a href={`tel:${LOCATION.phone.replace(/[^+\d]/g, '')}`}>{LOCATION.phone}</a>
          </p>
          <p className="footer-location">
            <span className="footer-ico" aria-hidden="true">🕘</span>
            <span>{LOCATION.hours}</span>
          </p>
        </div>
      </div>

      <p className="copy">
        © {new Date().getFullYear()} {LOCATION.university} · Student Internship Payment
        Management System (SIPMS) — All rights reserved.
      </p>
    </footer>
  );
}
