import AdminPortal from './AdminPortal';
import MessageCenter from '../../components/MessageCenter';

export default function AdminMessages() {
  return (
    <AdminPortal>
      <MessageCenter
        title="Messages"
        subtitle="Contact any office or student, follow correction requests, and keep system-wide communication in one place."
      />
    </AdminPortal>
  );
}
