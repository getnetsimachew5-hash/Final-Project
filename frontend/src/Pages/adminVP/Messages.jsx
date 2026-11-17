import AdminVPPortal from './AdminVPPortal';
import MessageCenter from '../../components/MessageCenter';

export default function AdminVPMessages() {
  return (
    <AdminVPPortal>
      <MessageCenter
        title="Messages"
        subtitle="Ask a lower office to correct or resend information, reply to the Academic VP or Finance, and keep a record of every request."
      />
    </AdminVPPortal>
  );
}
