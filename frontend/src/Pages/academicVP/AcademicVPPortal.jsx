import PortalLayout from '../../components/PortalLayout';
import './AcademicVPPortal.css';

/**
 * Academic Vice President Office portal.
 *
 * ROLE: Verifies academic eligibility and endorses the payment request
 *       for administrative processing.
 *
 * FUNCTIONS (from the official role card):
 *   1  View College-approved requests
 *   2  Review academic eligibility
 *   3  Review supporting documents
 *   4  Endorse eligible request
 *   5  Reject if requirements not satisfied
 *   6  Provide rejection comments
 *   7  Forward endorsed request to Administrative VP
 *   8  Monitor processed requests
 */
const menu = [
  { to: '/academic-vp',            label: 'Dashboard',             icon: '📊' },
  { to: '/academic-vp/eligibility',label: 'Review Eligibility',    icon: '🎓' },
  { to: '/academic-vp/documents',  label: 'Supporting Documents',  icon: '📄' },
  { to: '/academic-vp/approved',   label: 'Endorse / Reject',      icon: '✅' },
  { to: '/academic-vp/history',    label: 'Monitor Requests',      icon: '📋' },
  { to: '/academic-vp/messages',   label: 'Messages',              icon: '💬' },
];

export default function AcademicVPPortal({ children }) {
  return (
    <PortalLayout
      title="Academic VP Portal"
      menu={menu}
      portalClass="portal-academicvp"
      sidebarIcon="🎓"
      sidebarTitle="Academic VP"
      sidebarSubtitle="Eligibility & endorsement"
    >
      {children}
    </PortalLayout>
  );
}
