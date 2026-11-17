import PaymentRequestStatus from './PaymentRequestStatus';

/**
 * Shared, readable student-information table.
 *
 * One row per student with all the details every approving office needs:
 * name/email, university ID, program, year, TeleBirr phone, organization,
 * internship period, days, amount and the current request status.
 *
 * Usage:
 *   <StudentInfoTable requests={batch.requests} showOrg showStatus />
 *   <StudentInfoTable students={batch.students} />
 */
const valueOrDash = (value) => {
  const text = String(value ?? '').trim();
  return text || '—';
};

const fullDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
};

function normalizeRows({ requests, students }) {
  if (Array.isArray(requests) && requests.length > 0) {
    return requests.map((request, index) => {
      const student = request.student && typeof request.student === 'object'
        ? request.student
        : {};
      const ret = request.return && typeof request.return === 'object' ? request.return : {};
      return {
        key: String(request._id || student._id || index),
        student,
        amount: request.amount,
        dailyRate: request.dailyRate,
        durationDays: request.durationDays,
        status: request.status,
        orgName: ret.orgName || request.orgName || '',
        orgAddress: ret.orgAddress || '',
        supervisorName: ret.supervisorName || '',
        startDate: ret.startDate || request.startDate || null,
        endDate: ret.endDate || request.endDate || null,
        collegeApprovalComment: request.collegeApprovalComment,
        rejectionReason: request.rejectionReason,
        missingInfo: Array.isArray(request.missingInfo) ? request.missingInfo : [],
      };
    });
  }

  return (students || []).map((student, index) => ({
    key: String(student?._id || index),
    student: student || {},
    amount: null,
    dailyRate: null,
    durationDays: null,
    status: null,
    orgName: '',
    orgAddress: '',
    supervisorName: '',
    startDate: null,
    endDate: null,
    collegeApprovalComment: null,
    rejectionReason: null,
    missingInfo: [],
  }));
}

export default function StudentInfoTable({
  requests,
  students,
  showOrg = false,
  showAmount = true,
  showDuration = false,
  showStatus = true,
  showNotes = true,
  emptyText = 'No student information available.',
  caption,
}) {
  const rows = normalizeRows({ requests, students });

  if (rows.length === 0) {
    return <p className="muted student-info-empty">{emptyText}</p>;
  }

  const showPeriod = showOrg;
  const showSupervisor = showOrg;

  return (
    <div className="student-info-wrap">
      <table className="table student-info-table">
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            <th>#</th>
            <th>Student</th>
            <th>University ID</th>
            <th>Program</th>
            <th>Year / Semester</th>
            <th>TeleBirr phone</th>
            {showOrg && <th>Organization</th>}
            {showSupervisor && <th>Supervisor</th>}
            {showPeriod && <th>Internship period</th>}
            {showAmount && <th>Amount</th>}
            {showDuration && <th>Days</th>}
            {showStatus && <th>Status</th>}
            {showNotes && <th>Notes</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const student = row.student || {};
            const year = student.year ? `Year ${student.year}` : valueOrDash(student.semester);
            const notes = [];

            if (row.missingInfo.length > 0) notes.push(`Missing: ${row.missingInfo.join(', ')}`);
            if (row.collegeApprovalComment) notes.push(`College: ${row.collegeApprovalComment}`);
            if (row.rejectionReason && row.status !== 'rejected') notes.push(`Returned earlier: ${row.rejectionReason}`);
            if (row.rejectionReason && row.status === 'rejected') notes.push(`Rejected: ${row.rejectionReason}`);

            return (
              <tr key={row.key}>
                <td className="student-info-index">{index + 1}</td>
                <td className="student-info-name">
                  <b>{student.fullName || 'Unknown student (account removed)'}</b>
                  {student.email && <small className="student-info-sub">{student.email}</small>}
                  {student.username && <small className="student-info-sub">Username: {student.username}</small>}
                </td>
                <td className="cell-id">{valueOrDash(student.institutionalId)}</td>
                <td>{valueOrDash(student.program)}</td>
                <td>{year}</td>
                <td>{valueOrDash(student.phone)}</td>
                {showOrg && (
                  <td>
                    <b>{valueOrDash(row.orgName)}</b>
                    {row.orgAddress && <small className="student-info-sub">{row.orgAddress}</small>}
                  </td>
                )}
                {showSupervisor && (
                  <td>
                    {valueOrDash(row.supervisorName)}
                  </td>
                )}
                {showPeriod && (
                  <td>
                    {row.startDate || row.endDate
                      ? `${fullDate(row.startDate) || '—'} → ${fullDate(row.endDate) || '—'}`
                      : '—'}
                  </td>
                )}
                {showAmount && (
                  <td>
                    <b>{Number(row.amount || 0).toLocaleString()} ETB</b>
                    {row.dailyRate != null && (
                      <small className="student-info-sub">
                        {Number(row.dailyRate).toLocaleString()} ETB/day
                      </small>
                    )}
                  </td>
                )}
                {showDuration && (
                  <td>{row.durationDays != null ? `${row.durationDays} day(s)` : '—'}</td>
                )}
                {showStatus && (
                  <td>
                    {row.status ? <PaymentRequestStatus status={row.status} /> : '—'}
                  </td>
                )}
                {showNotes && (
                  <td className="student-info-notes">
                    {notes.length > 0 ? notes.map((note, i) => <div key={i}>{note}</div>) : '—'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
