const Return = require('../models/InternshipReturn');
const Letter = require('../models/CompletionLetter');

/**
 * ============================================================
 * STUDENT INFORMATION COMPLETENESS
 * ============================================================
 * The College Office must know, per student, exactly which piece of
 * information is missing before it approves a payment request.  The same
 * check is used by the student portal so a notified student sees the same
 * checklist and can correct the editable fields.
 *
 * IMPORTANT: this is a non-sensitive check only.  It never looks at
 * password hashes or any login credential.
 */

const hasValue = (value) => String(value ?? '').trim().length > 0;

/**
 * Account-level fields only (the details the student can edit on
 * /student/profile).  Used to block a return-form submission when the
 * student's own record is still incomplete — payments cannot be made
 * without these, so there is no point accepting the form first.
 */
function studentProfileMissingInfo(student) {
  if (!student) {
    // A request whose student account was deleted cannot be reviewed.
    return ['Student account (account was removed)'];
  }

  const missing = [];

  if (!hasValue(student.fullName))         missing.push('Full name');
  if (!hasValue(student.institutionalId))  missing.push('University ID');
  if (!hasValue(student.email))            missing.push('Email address');
  if (!hasValue(student.phone))            missing.push('Registered TeleBirr phone');
  if (!hasValue(student.program))          missing.push('Program / department');

  const year = Number(student.year);
  if (!Number.isInteger(year) || year < 1 || year > 7) {
    missing.push('Year of study (1–7)');
  }

  return missing;
}

/**
 * Everything required before a payment request can be approved:
 * account fields + internship return form + completion letter.
 */
function studentMissingInfo(student, internshipReturn, letter) {
  if (!student) {
    return ['Student account (account was removed)'];
  }

  const missing = studentProfileMissingInfo(student);

  if (!internshipReturn) {
    missing.push('Internship return form');
  } else {
    if (!hasValue(internshipReturn.orgName))        missing.push('Organization name');
    if (!hasValue(internshipReturn.orgAddress))     missing.push('Organization address');
    if (!hasValue(internshipReturn.supervisorName)) missing.push('Supervisor name');
    if (!internshipReturn.startDate)                missing.push('Internship start date');
    if (!internshipReturn.endDate)                  missing.push('Internship end date');
  }

  if (!letter) missing.push('Completion letter');

  return missing;
}

/**
 * Load return forms + completion letters for a set of student ids in one
 * round-trip.  Returns lookup maps so a whole batch can be checked without
 * issuing a query per student.
 */
async function loadStudentDocuments(studentIds) {
  const ids = [...new Set((studentIds || []).map(id => String(id || '')).filter(Boolean))];

  const returns = ids.length
    ? await Return.find({ student: { $in: ids } })
    : [];
  const letters = returns.length
    ? await Letter.find({ return: { $in: returns.map(r => r._id) } })
    : [];

  const returnByStudent = new Map();
  for (const ret of returns) returnByStudent.set(String(ret.student), ret);

  const letterByReturn = new Map();
  for (const letter of letters) letterByReturn.set(String(letter.return), letter);

  return { returns, letters, returnByStudent, letterByReturn };
}

/** Convenience helper for one already-populated request. */
function missingInfoForRequest(request, documents) {
  const student = request?.student;
  const studentId = String(student?._id || student || '');
  const ret = documents?.returnByStudent?.get(studentId) || null;
  const letter = ret ? documents?.letterByReturn?.get(String(ret._id)) || null : null;
  return studentMissingInfo(student, ret, letter);
}

/**
 * Pick the student portal page that can fix the first missing item.
 * Account fields → profile page; form/letter → their upload pages.
 */
function fixPageFor(missingInfo) {
  const values = (missingInfo || []).join(' ').toLowerCase();
  if (values.includes('completion letter')) return '/student/upload';
  if (values.includes('return form') || values.includes('organization') ||
      values.includes('supervisor') || values.includes('internship start') ||
      values.includes('internship end')) {
    return '/student/return';
  }
  return '/student/profile';
}

module.exports = {
  studentProfileMissingInfo,
  studentMissingInfo,
  loadStudentDocuments,
  missingInfoForRequest,
  requestMissingInfo: missingInfoForRequest,
  fixPageFor,
};
