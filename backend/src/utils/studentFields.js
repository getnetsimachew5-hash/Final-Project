const mongoose = require("mongoose");

/**
 * Shared "student information" projection.
 *
 * Every actor in the workflow (CS Department, College, Academic VP, Admin VP,
 * Finance, Admin) reviews the same students, so they all
 * need the SAME complete student information. Previously each controller
 * populated a different random subset ('fullName institutionalId phone' here,
 * 'fullName institutionalId' there), so an actor might see a student's phone
 * but not their program, and most could not see the program/semester at all.
 *
 * Use it with populate:
 *   .populate('student', STUDENT_POPULATE)
 *
 * Fields (all from the User model):
 *   fullName         — full name
 *   institutionalId  — personal ID from the student card (e.g. WCU1501410)
 *   email            — university email
 *   phone            — mobile (needed for TeleBirr OTP payments)
 *   role             — always 'student' (identity context)
 *   program          — degree program (e.g. BSc in Computer Science)
 *   year             — academic year (1-8)
 *   semester         — enrolled semester (e.g. '5th')
 *   username         — login name
 *   accountStatus    — pending/active/suspended (identity state)
 *   department       — academic department
 *
 * NEVER select passwordHash / plainPassword here — no office needs it, and the
 * CS Department's batch pages must not expose student login credentials.
 */
const STUDENT_POPULATE = [
  "fullName",
  "institutionalId",
  "email",
  "phone",
  "role",
  "program",
  "year",
  "semester",
  "username",
  "accountStatus",
  "department",
  "paymentReopenAllowed",
  "paymentReopenReason",
  "paymentReopenGrantedAt",
  "paymentReopenRequestedAt",
].join(" ");

/** populate an array field (e.g. PaymentBatch.students) with the same fields */
const STUDENT_POPULATE_ARRAY = STUDENT_POPULATE;

module.exports = { STUDENT_POPULATE, STUDENT_POPULATE_ARRAY };
