import { NavLink } from 'react-router-dom';
import Footer from './Footer';
import Navbar from './Navbar';

export default function PortalLayout({
  title,
  menu = [],
  children,
  portalClass = '',
  sidebarIcon,
  sidebarTitle,
  sidebarSubtitle,
}) {
  const showSidebarHead = Boolean(sidebarIcon || sidebarTitle || sidebarSubtitle);

  return (
    <>
      {/* MANDATORY global navigation bar on every actor dashboard */}
      <Navbar portalTitle={title} />

      <div className={`portal-shell ${portalClass}`.trim()}>
        <aside className="portal-side">
          {showSidebarHead && (
            <div className="portal-side-head">
              {sidebarIcon && (
                <span className="portal-side-icon" aria-hidden="true">{sidebarIcon}</span>
              )}
              <div className="portal-side-head-text">
                <strong>{sidebarTitle || title}</strong>
                {sidebarSubtitle && <small>{sidebarSubtitle}</small>}
              </div>
            </div>
          )}

          <nav className="portal-nav" aria-label="Portal menu">
            {menu.map(m => (
              <NavLink
                key={m.to}
                to={m.to}
                // Mark the portal's root dashboard link exact so it is not
                // highlighted on every sub-page, and expose 'active' so the
                // current dashboard is always visible (critical on small screens).
                end={!m.to.slice(1).includes('/')}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                {m.icon && (
                  <span className="portal-link-icon" aria-hidden="true">{m.icon}</span>
                )}
                <span className="portal-link-label">{m.label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>
        <section className="portal-main">{children}</section>
      </div>

      <Footer />
    </>
  );
}
