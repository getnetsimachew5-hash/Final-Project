// Shared helpers for the Finance guided 10-step workflow.

export const money = (n) => (Number(n) || 0).toLocaleString();

export const apiError = (e, fallback) =>
  e.response?.data?.errors?.[0]?.msg || e.response?.data?.message || fallback;

export const shortDate = (value) =>
  value ? new Date(value).toLocaleDateString() : '—';

export const dateTime = (value) =>
  value ? new Date(value).toLocaleString() : '—';

export const daysBetween = (start, end) => {
  if (!start || !end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.round(ms / 86400000) + 1;
};

export const requestsOf = (batch) => batch?.requests || [];

export const pendingRequestsOf = (batch) =>
  requestsOf(batch).filter((request) => request.status === 'pending_finance');

export const requestTotal = (requests) =>
  (requests || []).reduce((sum, request) => sum + (Number(request.amount) || 0), 0);

export const batchTotal = (batch) =>
  Number(batch?.totalAmount) || requestTotal(requestsOf(batch));

// The registered account phone is authoritative; studentPhone is only a
// snapshot used for older requests.
export const studentPhone = (request) =>
  request?.student?.phone || request?.studentPhone || '';

export const studentLabel = (request) =>
  request?.student?.fullName
    || request?.student?.institutionalId
    || 'Unknown student';

export const findRequest = (requests, requestId) =>
  (requests || []).find((request) => String(request._id) === String(requestId));

export const transactionFor = (transactions, requestId) =>
  (transactions || []).find(
    (transaction) => String(transaction.requestId) === String(requestId)
  );

export const roleLabel = {
  student: 'Student',
  cs_dept: 'CS Department',
  college: 'College Office',
  academic_vp: 'Academic VP Office',
  admin_vp: 'Administrative VP Office',
  industrial: 'Former staff',
  finance: 'Finance Office',
  admin: 'System Administrator',
};

export const actionLabel = {
  created: 'Batch created by the CS Department',
  forwarded_to_college: 'Forwarded to the College Office',
  endorsed: 'Academic VP endorsed → sent to Admin VP',
  payment_confirmed: 'Payment availability confirmed by Admin VP',
  authorized: 'Authorized by Admin VP → forwarded directly to Finance',
  letters_reviewed: 'Completion letters reviewed',
  industrial_approved: 'Legacy verification approved',
  verified: 'Supporting information verified → forwarded to Finance',
  finance_reviewed: 'Finance reviewed the payment information',
  finance_review_reset: 'Finance payment-information review reset',
  finance_amount_confirmed: 'Finance confirmed the payment amount',
  finance_mode_selected: 'Finance selected the payment method',
  finance_simulated: 'TeleBirr payment simulated',
  finance_reference_generated: 'Finance generated the payment reference',
  finance_payments_confirmed: 'TeleBirr payment confirmed for student(s)',
  finance_payment_cycle_reset: 'Ready for the next TeleBirr payment cycle',
  finance_partial_payment: 'Some students have been paid',
  batch_paid: 'Batch marked PAID',
  finance_report_generated: 'Finance generated the payment report',
  process_payment: 'Individual payment processed by Finance',
  returned_to_admin_vp: 'Returned to Admin VP for correction',
};

export const statusNote = {
  pending_finance: 'With the Finance Office — payment processing.',
  paid: 'Payment completed. Students were notified via TeleBirr.',
};

export const paymentModeLabel = (mode) =>
  mode === 'individual' ? 'Individual payment' : mode === 'batch' ? 'Batch payment' : 'Not selected';
