/**
 * Date helpers for the internship return form.
 *
 * The number of internship days is calculated INCLUSIVELY, so:
 *   2026-01-01 → 2026-01-31  = 31 days
 *   2026-01-01 → 2026-01-01  = 1 day
 *
 * Every student has their own start/end dates, so each record is computed
 * independently — the shared helper guarantees the CS Department page and the
 * payment service always produce the SAME number.
 */
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** True when both dates parse and end is not before start. */
function isValidRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return end >= start;
}

/** Inclusive number of internship days. Returns 0 for invalid/empty ranges. */
function internshipDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  if (!isValidRange(startDate, endDate)) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.floor((end - start) / MS_PER_DAY) + 1;
}

module.exports = { internshipDays, isValidRange, MS_PER_DAY };
