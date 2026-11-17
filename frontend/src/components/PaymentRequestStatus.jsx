// Per-student payment request status badge with clear, human wording —
// used by the College to see each student's individual decision.
const LABELS = {
  pending_department:    { className: 'badge grey',   text: 'Created (CS Dept)' },
  pending_college:       { className: 'badge orange', text: 'Not decided' },
  college_approved:      { className: 'badge purple', text: 'Approved ✓ (College)' },
  pending_academic_vp:   { className: 'badge blue',   text: 'Forwarded → Academic VP' },
  pending_admin_vp:      { className: 'badge blue',   text: 'Admin VP review' },
  pending_finance:       { className: 'badge blue',   text: 'Finance processing' },
  paid:                  { className: 'badge green',  text: 'Paid via TeleBirr' },
  rejected:              { className: 'badge red',    text: 'Rejected' },
};

export default function PaymentRequestStatus({ status }) {
  const s = LABELS[status] || { className: 'badge grey', text: status || 'unknown' };
  return <span className={s.className}>{s.text}</span>;
}
