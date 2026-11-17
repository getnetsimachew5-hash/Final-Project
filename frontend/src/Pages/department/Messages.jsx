import DepartmentPortal from './DepartmentPortal';
import MessageCenter from '../../components/MessageCenter';

export default function DepartmentMessages() {
  return (
    <DepartmentPortal>
      <MessageCenter
        title="Messages"
        subtitle="Message a student about incorrect information, reply to the College or a higher office, and keep every correction request in one thread."
      />
    </DepartmentPortal>
  );
}
