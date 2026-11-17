import PortalLayout from '../../components/PortalLayout';
import './CollegePortal.css';

/**
 * College Office portal.
 *
 * The sidebar follows the office's official function list, in order:
 *
 *   1  Dashboard           – function 1+2: log in, view requests received
 *                            from the CS Department
 *   2  Student Documents   – functions 3+4: review return forms AND
 *                            completion letters in one consolidated view
 *   3  Review & Approve    – functions 5+6+7: verify information is complete,
 *                            approve or reject the request, provide comments
 *                            when rejecting
 *   4  Forward to AVP      – function 8: forward approved requests to the
 *                            Academic Vice President Office
 *   5  History             – function 9: monitor previously processed requests
 */
const menu = [
  { to: '/college',           label: 'Dashboard',                icon: '📊' },
  { to: '/college/documents', label: 'Student Documents',        icon: '📁' },
  { to: '/college/pending',   label: 'Review & Approve',         icon: '✅' },
  { to: '/college/forward',   label: 'Forward to Academic VP',   icon: '📤' },
  { to: '/college/history',   label: 'History',                  icon: '🕘' },
  { to: '/college/messages',  label: 'Messages',                 icon: '💬' },
];

export default function CollegePortal({ children }) {
  return (
    <PortalLayout
      title="College Portal"
      menu={menu}
      portalClass="portal-college"
      sidebarIcon="🏫"
      sidebarTitle="College Office"
      sidebarSubtitle="Review & endorsement workflow"
    >
      {children}
    </PortalLayout>
  );
}
