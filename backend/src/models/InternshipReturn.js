const mongoose = require('mongoose');

/**
 * Second layer of validation: the API validator (utils/returnValidation.js)
 * gives friendly, field-level errors; these schema rules guarantee that no
 * other code path (seed scripts, future endpoints) can store junk either.
 */
const PHONE_RE = /^\+?\d{9,15}$/;

module.exports = mongoose.model('InternshipReturn', new mongoose.Schema({
  student:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  orgName: {
    type: String,
    required: [true, 'Organization name is required'],
    trim: true,
    minlength: [2, 'Organization name is too short'],
    maxlength: [120, 'Organization name is too long'],
  },
  orgAddress: {
    type: String,
    required: [true, 'Organization address is required'],
    trim: true,
    minlength: [3, 'Organization address is too short'],
    maxlength: [200, 'Organization address is too long'],
  },
  supervisorName: {
    type: String,
    required: [true, 'Supervisor name is required'],
    trim: true,
    minlength: [2, 'Supervisor name is too short'],
    maxlength: [120, 'Supervisor name is too long'],
  },
  supervisorPhone: {
    type: String,
    trim: true,
    validate: {
      validator: (value) => !value || PHONE_RE.test(String(value).replace(/[\s\-()]/g, '')),
      message: 'Supervisor phone must contain 9–15 digits',
    },
  },
  startDate:       Date,
  endDate:         Date,
  status: {
    type: String,
    enum: ['submitted', 'pending_department', 'pending_college',
           'pending_academic_vp', 'pending_admin_vp',
           'pending_finance', 'paid', 'rejected'],
    default: 'submitted',
  },
  rejectionReason: String,
  verified:   { type: Boolean, default: false },
  verifiedAt: Date,
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true }));
