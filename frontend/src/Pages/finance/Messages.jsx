import FinancePortal from './FinancePortal';
import MessageCenter from '../../components/MessageCenter';

export default function FinanceMessages() {
  return (
    <FinancePortal>
      <MessageCenter
        title="Messages"
        subtitle="Ask the Admin VP, College or CS Department for corrected payment information, and reply to students about their payment."
      />
    </FinancePortal>
  );
}
