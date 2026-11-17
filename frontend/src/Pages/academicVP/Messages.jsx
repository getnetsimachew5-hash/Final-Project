import AcademicVPPortal from './AcademicVPPortal';
import MessageCenter from '../../components/MessageCenter';

export default function AcademicVPMessages() {
  return (
    <AcademicVPPortal>
      <MessageCenter
        title="Messages"
        subtitle="Return a batch with a clear explanation, ask the College or CS Department to send corrected information, or contact a student."
      />
    </AcademicVPPortal>
  );
}
