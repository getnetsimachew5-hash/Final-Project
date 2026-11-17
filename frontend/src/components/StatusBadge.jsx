const COLORS = {
  submitted: 'grey',
  pending_department: 'blue',
  pending_college: 'yellow',
  pending_academic_vp: 'yellow',
  pending_admin_vp: 'yellow',
  pending_finance: 'purple',
  paid: 'green',
  rejected: 'red',
};

export default function StatusBadge({ status }) {
  const label = (status || '').replaceAll('_', ' ').toUpperCase();
  return <span className={`badge ${COLORS[status] || 'grey'}`}>{label}</span>;
}