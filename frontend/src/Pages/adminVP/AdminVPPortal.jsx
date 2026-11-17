import PortalLayout from '../../components/PortalLayout';
import './AdminVPPortal.css';

const menu = [
  { to: '/admin-vp',           label: 'Guided Workflow (1–7)', icon: '🧭' },
  { to: '/admin-vp/endorsed',  label: 'Academically Endorsed', icon: '🎓' },
  { to: '/admin-vp/review',    label: 'Administrative Review', icon: '🔍' },
  { to: '/admin-vp/authorize', label: 'Payment Authorization', icon: '✅' },
  { to: '/admin-vp/history',   label: 'History',               icon: '🕘' },
  { to: '/admin-vp/messages',  label: 'Messages',              icon: '💬' },
];

export default function AdminVPPortal({ children }) {
  return (
    <PortalLayout
      title="Administrative VP Portal"
      menu={menu}
      portalClass="portal-adminvp"
      sidebarIcon="⚖️"
      sidebarTitle="Administrative VP"
      sidebarSubtitle="Authorization & budget workflow"
    >
      {children}
    </PortalLayout>
  );
}
