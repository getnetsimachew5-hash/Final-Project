import PortalLayout from '../../components/PortalLayout';
import './AdminPortal.css';

const menu = [
  { to: '/admin',          label: 'Dashboard',   icon: '📊' },
  { to: '/admin/users',    label: 'Users',       icon: '👥' },
  { to: '/admin/logs',     label: 'Audit Logs',  icon: '🧾' },
  { to: '/admin/messages', label: 'Messages',    icon: '💬' },
];

export default function AdminPortal({ children }) {
  return (
    <PortalLayout
      title="System Administrator"
      menu={menu}
      portalClass="portal-admin"
      sidebarIcon="🖥️"
      sidebarTitle="System Administrator"
      sidebarSubtitle="Users, audit & backups"
    >
      {children}
    </PortalLayout>
  );
}
