
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

export default function Navbar({ portalTitle }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [portalsOpen, setPortalsOpen] = useState(false);

  const portals = [
    { to: '/student', label: 'Student' },
    { to: '/cs-dept', label: 'CS Department' },
    { to: '/college', label: 'College' },
    { to: '/academic-vp', label: 'Academic VP' },
    { to: '/admin-vp', label: 'Administrative VP' },
    { to: '/finance', label: 'Finance' },
    { to: '/admin', label: 'Admin' },
  ];

  const closeMenu = () => {
    setMenuOpen(false);
    setPortalsOpen(false);
  };

  const handleLogout = () => {
    logout();
    closeMenu();
    nav('/login');
  };

  return (
    <header className={`sipms-header ${portalTitle ? 'portal' : ''}`}>
      <div className="sipms-brand">
        {portalTitle && <span className="portal-badge">🎓 {portalTitle}</span>}
        <Link to="/" className="brand-link" onClick={closeMenu}>
          <img
            src="/favicon.ico"
            alt="Wachemo University"
            className="university-logo"
          />
          <span className="brand-text">
            <strong>SIPMS</strong>
            <small>Wachemo University</small>
          </span>
        </Link>
      </div>

      <button
        className="menu-toggle"
        type="button"
        aria-label="Toggle navigation"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(!menuOpen)}
      >
        {menuOpen ? '✕' : '☰'}
      </button>

      <nav className={`sipms-nav ${menuOpen ? 'nav-open' : ''}`}>
        <Link to="/" onClick={closeMenu}>Home</Link>
        <Link to="/about" onClick={closeMenu}>About</Link>
        <Link to="/workflow" onClick={closeMenu}>Workflow</Link>

        <div className={`dropdown ${portalsOpen ? 'dropdown-open' : ''}`}>
          <button
            type="button"
            className="dropdown-toggle"
            aria-expanded={portalsOpen}
            onClick={() => setPortalsOpen(!portalsOpen)}
          >
            Portals <span>▾</span>
          </button>

          <div className="dropdown-menu">
            {portals.map((p) => (
              <Link key={p.to} to={p.to} onClick={closeMenu}>
                {p.label}
              </Link>
            ))}
          </div>
        </div>

        {user ? (
          <>
            <span className="user-chip">
              {user.fullName} ({user.role})
            </span>
            <button className="nav-button" onClick={handleLogout}>
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login" onClick={closeMenu}>Login</Link>
            <Link to="/register" className="register-link" onClick={closeMenu}>
              Register
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
