import PortalLayout from '../../components/PortalLayout';
import './StudentPortal.css';

/**
 * Student portal shell.
 *
 * Access is controlled by the backend: a student can only reach this portal
 * after an administrator has approved (activated) the account. There is no
 * self-service verification step here anymore.
 */
const baseMenu = [
  { to: '/student',              label: 'Dashboard',                    icon: '📊' },
  { to: '/student/profile',      label: 'My Information',               icon: '👤' },
  { to: '/student/return',       label: 'Internship Return Form',       icon: '📝' },
  { to: '/student/upload',       label: 'Completion Letter Upload',     icon: '📎' },
  { to: '/student/status',       label: 'Submission & Payment Status',  icon: '📈' },
  { to: '/student/messages',     label: 'Messages & Notifications',     icon: '💬' },
  { to: '/student/history',      label: 'Payment History',              icon: '🕘' },
];

export default function StudentPortal({ children }) {
  return (
    <PortalLayout
      title="Student Portal"
      menu={baseMenu}
      portalClass="portal-student"
      sidebarIcon="🎓"
      sidebarTitle="Student Portal"
      sidebarSubtitle="Internship payment tracker"
    >
      {children}
    </PortalLayout>
  );
}

export const studentMenu = baseMenu;
