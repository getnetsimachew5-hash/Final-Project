const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName:        { type: String, required: true, trim: true },
  institutionalId: { type: String, required: true, unique: true, trim: true },
  username:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  email:           { type: String, lowercase: true, trim: true, unique: true, sparse: true },
  phone:           { type: String, trim: true, unique: true, sparse: true },
  passwordHash:    { type: String, required: true },
  role: {
    type: String,
    // `industrial` is retained only so historical records can still be read.
    // No new Industrial account can be registered; legacy accounts are suspended.
    enum: ['student', 'cs_dept', 'college', 'academic_vp', 'admin_vp',
           'industrial', 'finance', 'admin'],
    required: true,
  },
  accountStatus: {
    type: String,
    enum: ['pending', 'active', 'suspended'],
    default: 'pending',
    index: true,
  },
  program:    String,
  year:       Number,
  // Semester the student is enrolled in (e.g. '1st' … '8th')
  semester:   { type: String, trim: true },
  verifiedIdentity: { type: Boolean, default: false },
  department: { type: String, default: 'Computer Science' },

  // A completed payment normally locks the student's information. The CS
  // Department may open a controlled update window for one student (for
  // example when a correction is needed after payment). The permission is
  // consumed when the next payment batch is created.
  paymentReopenAllowed:   { type: Boolean, default: false, index: true },
  paymentReopenReason:    { type: String, trim: true },
  paymentReopenGrantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  paymentReopenGrantedAt: Date,
  paymentReopenRequestedAt: Date,
}, { timestamps: true });

userSchema.virtual('canLogin').get(function () {
  if (this.role !== 'student') return this.accountStatus === 'active';
  return this.verifiedIdentity && this.accountStatus !== 'suspended';
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

// IMPORTANT: Only hash if the value is still plain text
userSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;

  // Already a bcrypt hash? → do NOT hash again
  if (this.passwordHash && this.passwordHash.startsWith('$2')) return;

  this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
});

module.exports = mongoose.model('User', userSchema);