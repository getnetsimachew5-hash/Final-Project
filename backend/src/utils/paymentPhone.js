const User = require('../models/User');

/**
 * TeleBirr phone resolution.
 *
 * The student's REGISTERED account phone (User.phone) is the source of truth.
 * `PaymentRequest.studentPhone` is only a snapshot/fallback for old records.
 * Keeping this in one place prevents the CS Department, Finance and the
 * TeleBirr service from paying three different numbers for the same student.
 */

/**
 * Normalize a phone number to the form TeleBirr expects.
 *
 * Accepts local Ethiopian numbers (`0911223344`, `0711223344`, `911223344`)
 * and international numbers (`+251911223344`, `251911223344`) as well as
 * numbers with spaces, dashes or brackets. Local Ethiopian numbers become
 * `+251…`; other numbers are returned without separators.
 */
const normalizePhone = (value) => {
  let phone = String(value || '').replace(/[\s\-()]/g, '').trim();
  if (!phone) return '';

  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;

  // Ethiopian local mobile: 0 + 7/9 + 8 digits.
  if (/^0[79]\d{8}$/.test(phone)) return `+251${phone.slice(1)}`;
  // Ethiopian mobile without the leading 0: 7/9 + 8 digits.
  if (/^[79]\d{8}$/.test(phone)) return `+251${phone}`;
  // Ethiopian country code without the plus.
  if (/^251[79]\d{8}$/.test(phone)) return `+${phone}`;

  return phone;
};

/** Synchronous read for already-populated requests. */
function requestPhone(request) {
  const student = request?.student;
  if (student && typeof student === 'object' && student.phone) {
    return normalizePhone(student.phone);
  }
  return normalizePhone(request?.studentPhone);
}

/**
 * Resolve the registered phone even when `student` is only an ObjectId.
 * Falls back to the saved request snapshot when the account has no phone.
 */
async function registeredPhone(request) {
  const direct = requestPhone(request);
  if (direct) return direct;

  const studentId = request?.student?._id || request?.student;
  if (!studentId) return '';

  const user = await User.findById(studentId).select('phone').lean();
  return normalizePhone(user?.phone);
}

/**
 * Resolve the registered phone and keep the request snapshot in sync. Returns
 * an empty string when the student has no registered number.
 */
async function syncRequestPhone(request) {
  const phone = await registeredPhone(request);
  if (phone && String(request.studentPhone || '') !== phone) {
    request.studentPhone = phone;
    if (typeof request.save === 'function') {
      await request.save();
    } else {
      await require('../models/PaymentRequest').updateOne(
        { _id: request._id },
        { $set: { studentPhone: phone } }
      );
    }
  }
  return phone;
}

module.exports = {
  normalizePhone,
  requestPhone,
  registeredPhone,
  syncRequestPhone,
};
