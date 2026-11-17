import PortalLayout from '../../components/PortalLayout';
import './DepartmentPortal.css';

const menu = [
  { to: '/cs-dept',             label: 'Dashboard',             icon: '📊' },
  { to: '/cs-dept/submissions', label: 'Student Submissions',   icon: '📋' },
  { to: '/cs-dept/verify',      label: 'Verify Students',       icon: '✅' },
  { to: '/cs-dept/batch',       label: 'Payment Batch',         icon: '💳' },
  { to: '/cs-dept/requests',    label: 'Payment Request List',  icon: '📨' },
  { to: '/cs-dept/forward',     label: 'Forward to College',    icon: '➡️' },
  { to: '/cs-dept/rejected',    label: 'Rejected Requests',     icon: '⛔' },
  { to: '/cs-dept/history',     label: 'History',               icon: '🕘' },
  { to: '/cs-dept/messages',    label: 'Messages',              icon: '💬' },
];

export default function DepartmentPortal({ children }) {
  return (
    <PortalLayout
      title="CS Department Portal"
      menu={menu}
      portalClass="portal-dept"
      sidebarIcon="💻"
      sidebarTitle="CS Department"
      sidebarSubtitle="Internship payment workflow"
    >
      {children}
    </PortalLayout>
  );
}
