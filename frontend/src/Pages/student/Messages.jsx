import StudentPortal from './StudentPortal';
import MessageCenter from '../../components/MessageCenter';

export default function StudentMessages() {
  return (
    <StudentPortal>
      <MessageCenter
        title="Messages & Notifications"
        subtitle="Ask an office to correct your information, reply to a correction request, and follow every update about your internship payment in one conversation."
      />
    </StudentPortal>
  );
}
