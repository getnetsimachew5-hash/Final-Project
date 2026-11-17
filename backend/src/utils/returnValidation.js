/**
 * ============================================================
 * INTERNSHIP RETURN FORM VALIDATION
 * ============================================================
 * One authoritative validator shared by the API.  It is intentionally
 * stricter than "is the field non-empty":
 *
 *   • trims input first  (a value of "   " is NOT a value)
 *   • enforces sensible lengths (no 1-character organizations)
 *   • rejects strings that contain no letters at all ("123", "---")
 *   • checks the supervisor phone format when one is supplied
 *   • checks the date order, a sane lower/upper bound and a maximum
 *     internship length
 *
 * The controller uses `values` (already normalized) when saving, so the
 * database never stores untrimmed data.  Errors carry the exact field name
 * so the React form can highlight the right input.
 */

const MIN_DATE = new Date('2000-01-01T00:00:00.000Z');
const MAX_DAYS = 365;
const FIVE_YEARS_MS = 5 * 365 * 24 * 60 * 60 * 1000;

const collapse = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const letterCount = (value) => (String(value ?? '').match(/\p{L}/gu) || []).length;
const normalizePhone = (value) => String(value ?? '').replace(/[\s\-()]/g, '');

const PHONE_RE = /^\+?\d{9,15}$/;

function validateReturnInput(body = {}) {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });

  /* ---------- Organization ---------- */
  const orgName = collapse(body.orgName);
  if (!orgName) {
    add('orgName', 'Organization name is required.');
  } else if (orgName.length < 2) {
    add('orgName', 'Organization name is too short (at least 2 characters).');
  } else if (orgName.length > 120) {
    add('orgName', 'Organization name must be 120 characters or fewer.');
  } else if (letterCount(orgName) < 2) {
    add('orgName', 'Organization name must contain letters, not only numbers or symbols.');
  }

  const orgAddress = collapse(body.orgAddress);
  if (!orgAddress) {
    add('orgAddress', 'Organization address is required.');
  } else if (orgAddress.length < 3) {
    add('orgAddress', 'Organization address is too short (at least 3 characters).');
  } else if (orgAddress.length > 200) {
    add('orgAddress', 'Organization address must be 200 characters or fewer.');
  } else if (letterCount(orgAddress) < 1) {
    add('orgAddress', 'Organization address must contain letters, not only numbers.');
  }

  /* ---------- Supervisor ---------- */
  const supervisorName = collapse(body.supervisorName);
  if (!supervisorName) {
    add('supervisorName', 'Supervisor name is required.');
  } else if (supervisorName.length < 2) {
    add('supervisorName', 'Supervisor name is too short (at least 2 characters).');
  } else if (supervisorName.length > 120) {
    add('supervisorName', 'Supervisor name must be 120 characters or fewer.');
  } else if (letterCount(supervisorName) < 2) {
    add('supervisorName', 'Supervisor name must contain letters, not only numbers or symbols.');
  }

  // Optional, but must be a real phone number when provided.
  const supervisorPhoneRaw = String(body.supervisorPhone ?? '').trim();
  const supervisorPhone = normalizePhone(supervisorPhoneRaw);
  if (supervisorPhoneRaw && !PHONE_RE.test(supervisorPhone)) {
    add('supervisorPhone', 'Supervisor phone must be 9–15 digits, e.g. +251911223344.');
  }

  /* ---------- Dates ---------- */
  const startRaw = String(body.startDate ?? '').trim();
  const endRaw = String(body.endDate ?? '').trim();

  let startDate = null;
  let endDate = null;

  if (!startRaw) {
    add('startDate', 'Internship start date is required.');
  } else {
    startDate = new Date(startRaw);
    if (Number.isNaN(startDate.getTime())) {
      add('startDate', 'Internship start date is not a valid date.');
      startDate = null;
    } else if (startDate < MIN_DATE) {
      add('startDate', 'Internship start date looks invalid (before the year 2000).');
    }
  }

  if (!endRaw) {
    add('endDate', 'Internship end date is required.');
  } else {
    endDate = new Date(endRaw);
    if (Number.isNaN(endDate.getTime())) {
      add('endDate', 'Internship end date is not a valid date.');
      endDate = null;
    }
  }

  if (startDate && endDate) {
    if (endDate < startDate) {
      add('endDate', 'Internship end date cannot be before the start date.');
    } else {
      const days = Math.floor((endDate - startDate) / 86400000) + 1;
      if (days > MAX_DAYS) {
        add('endDate', `Internship duration (${days} days) is too long — the maximum is ${MAX_DAYS} days.`);
      }
    }

    if (endDate > new Date(Date.now() + FIVE_YEARS_MS)) {
      add('endDate', 'Internship end date is too far in the future. Check the year.');
    }
  }

  const ok = errors.length === 0;

  return {
    ok,
    errors,
    firstError: errors[0] || null,
    values: {
      orgName,
      orgAddress,
      supervisorName,
      supervisorPhone: supervisorPhone || undefined,
      startDate,
      endDate,
    },
  };
}

module.exports = { validateReturnInput, MAX_DAYS };
