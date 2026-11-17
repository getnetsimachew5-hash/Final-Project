import CollegePortal from './CollegePortal';
import MessageCenter from '../../components/MessageCenter';

export default function CollegeMessages() {
  return (
    <CollegePortal>
      <MessageCenter
        title="Messages"
        subtitle="Ask the CS Department to correct student information, reply to students, and coordinate with the Academic VP and other offices."
      />
    </CollegePortal>
  );
}
