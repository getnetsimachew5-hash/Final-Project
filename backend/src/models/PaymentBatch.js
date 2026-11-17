const mongoose = require('mongoose');

module.exports = mongoose.model('PaymentBatch', new mongoose.Schema({
  // Names are intentionally NOT unique: the same batch name may be used in a
  // different month/semester/academic year. `batchCode` below is the unique,
  // human-readable identifier.
  batchName:    { type: String, required: true },
  batchMonth:   { type: String, default: '' },
  batchCode:    { type: String, unique: true, sparse: true },
  semester:     { type: String, enum: ['First', 'Second'], required: true },
  academicYear: { type: String, required: true },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  students:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: {
    type: String,
    enum: ['draft', 'pending_college', 'pending_academic_vp',
           'pending_admin_vp', 'pending_finance', 'paid', 'rejected'],
    default: 'draft',
  },
  rejectionReason: String,

  // Admin VP decision trail — kept separate from `status` so the office can
  // approve first and forward directly to Finance as a distinct step.
  adminVpDecision:   { type: String, enum: ['approved', 'rejected'] },
  adminVpComment:    String,
  adminVpDecidedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  adminVpDecidedAt:  Date,
  adminVpForwardedAt: Date,

  // Payment availability/authorization confirmation recorded before approval.
  authorizedAmount:  Number,
  paymentReference:  String,
  paymentConfirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  paymentConfirmedAt: Date,

  // Finance Office guided workflow trail (functions 1–10). These fields let the
  // portal resume at the exact payment step without re-running earlier steps.
  financeReviewConfirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  financeReviewConfirmedAt: Date,
  financeAmountConfirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  financeAmountConfirmedAt: Date,
  financeConfirmedAmount:   Number,
  financePaymentMode:       { type: String, enum: ['individual', 'batch'] },
  financeSelectedRequest:   { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentRequest' },
  financeModeSelectedAt:    Date,
  financeSimulatedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  financeSimulatedAt:       Date,
  financeReference:         String,
  financePaymentConfirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  financePaymentConfirmedAt: Date,
  financePaidAt:            Date,
  financeReportGeneratedAt: Date,

  history: [{
    actor:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action:  String,
    comment: String,
    at:      { type: Date, default: Date.now },
    meta:   { type: Map, of: String },
  }],
}, { timestamps: true }));
