import PortalLayout from '../../components/PortalLayout';
import './FinancePortal.css';

const menu = [
  { to: '/finance',           label: 'Guided Workflow (1–10)', icon: '🧭' },
  { to: '/finance/approved',  label: 'Approved Requests',      icon: '📥' },
  { to: '/finance/individual',label: 'Individual Payment',     icon: '👤' },
  { to: '/finance/batch',     label: 'Batch Payment',          icon: '👥' },
  { to: '/finance/history',   label: 'Payment History',        icon: '🕘' },
  { to: '/finance/reports',   label: 'Reports',                icon: '📊' },
  { to: '/finance/messages',  label: 'Messages',               icon: '💬' },
];

export default function FinancePortal({ children }) {
  return (
    <PortalLayout
      title="Finance Portal"
      menu={menu}
      portalClass="portal-finance"
      sidebarIcon="💳"
      sidebarTitle="Finance Office"
      sidebarSubtitle="TeleBirr payment workflow"
    >
      {children}
    </PortalLayout>
  );
}
