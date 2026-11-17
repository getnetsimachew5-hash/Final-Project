const mongoose = require('mongoose');

module.exports = mongoose.model('PaymentRequest', new mongoose.Schema({
  batch:   { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentBatch', required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  return:  { type: mongoose.Schema.Types.ObjectId, ref: 'InternshipReturn' },

  // Amount breakdown: stipend = dailyRate × durationDays (internship period).
  dailyRate:     { type: Number, default: 100 },
  durationDays:  { type: Number, default: 0 },
  amount:        { type: Number, default: 3000 },

  // Student phone used for the TeleBirr OTP confirmation.
  studentPhone:  String,

  status:  { type: String, default: 'pending_department' },
  rejectionReason: String,
  // College per-student review note (approveStudent at the College stage)
  collegeApprovalComment: String,

  // --- Missing-information follow-up (College Office) -------------------
  // The College never approves an incomplete student.  It can notify that
  // student with the exact list of missing fields; the list is snapshotted
  // here so every office can see that a correction was requested.
  missingInfoRequestedAt: Date,
  missingInfoRequestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  missingInfoSnapshot: [String],

  // A paid request can be explicitly released by the CS Department so the
  // student may correct their information and start a new payment cycle.
  // `reopenedAt` keeps the old payment in history while removing it from the
  // "one student, one active payment" guard.
  reopenedAt: Date,
  reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reopenReason: String,
  cycle: { type: Number, default: 1 },
}, { timestamps: true }));
