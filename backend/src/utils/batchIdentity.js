/**
 * Batch identity helpers.
 *
 * Two batches may share the same name as long as they belong to a different
 * month, semester or academic year (for example "Batch 3rdYear" for March and
 * another "Batch 3rdYear" for June). `batchCode` is the short, human-readable
 * identifier that keeps every batch unique in lists, notifications and reports.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_ALIASES = {
  jan: 'January', feb: 'February', mar: 'March', apr: 'April',
  may: 'May', jun: 'June', jul: 'July', aug: 'August',
  sep: 'September', sept: 'September', oct: 'October',
  nov: 'November', dec: 'December',
};

/** Accept a month number (1–12), full name or 3-letter abbreviation. */
function normalizeBatchMonth(value) {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  const asNumber = Number(raw);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= 12) {
    return MONTHS[asNumber - 1];
  }

  const lower = raw.toLowerCase();
  const exact = MONTHS.find(month => month.toLowerCase() === lower);
  if (exact) return exact;
  return MONTH_ALIASES[lower.slice(0, 4)] || MONTH_ALIASES[lower.slice(0, 3)] || raw;
}

/**
 * The fields that define "the same batch". Used by the duplicate check so
 * identical names in different months/years are allowed.
 */
function batchIdentity({ batchName, semester, academicYear, batchMonth }) {
  return {
    batchName: String(batchName || '').trim(),
    semester: String(semester || '').trim(),
    academicYear: String(academicYear || '').trim(),
    batchMonth: normalizeBatchMonth(batchMonth),
  };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * MongoDB filter matching a batch identity case-insensitively. Batches created
 * before `batchMonth` existed are treated as having no month.
 */
function batchIdentityFilter(identity) {
  const match = batchIdentity(identity);
  const filter = {
    batchName: { $regex: `^${escapeRegex(match.batchName)}$`, $options: 'i' },
    semester: { $regex: `^${escapeRegex(match.semester)}$`, $options: 'i' },
    academicYear: { $regex: `^${escapeRegex(match.academicYear)}$`, $options: 'i' },
  };

  if (match.batchMonth) {
    filter.batchMonth = { $regex: `^${escapeRegex(match.batchMonth)}$`, $options: 'i' };
  } else {
    filter.$or = [{ batchMonth: { $in: ['', null] } }, { batchMonth: { $exists: false } }];
  }

  return filter;
}

/** Base code, e.g. BT-2025-26-F03-BATCH3RD. */
function buildBatchCode({ batchName, semester, academicYear, batchMonth }) {
  const identity = batchIdentity({ batchName, semester, academicYear, batchMonth });
  const year = identity.academicYear.replace(/[^0-9A-Za-z]/g, '') || 'YEAR';
  const semesterCode = identity.semester.slice(0, 1).toUpperCase() || 'S';
  const monthIndex = MONTHS.indexOf(identity.batchMonth) + 1;
  const monthCode = String(monthIndex || 0).padStart(2, '0');
  const nameCode = identity.batchName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8) || 'BATCH';

  return `BT-${year}-${semesterCode}${monthCode}-${nameCode}`;
}

/** Generate a code that is not used yet (adds -2, -3 … when needed). */
async function nextBatchCode(Batch, identity) {
  const base = buildBatchCode(identity);
  let code = base;
  let suffix = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await Batch.exists({ batchCode: code })) {
    suffix += 1;
    code = `${base}-${suffix}`;
  }
  return code;
}

module.exports = {
  MONTHS,
  normalizeBatchMonth,
  batchIdentity,
  batchIdentityFilter,
  buildBatchCode,
  nextBatchCode,
};
