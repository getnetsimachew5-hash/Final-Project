const mongoose = require('mongoose');

module.exports = mongoose.model('TeleBirrTransaction', new mongoose.Schema({
  request:     { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentRequest', required: true, unique: true },
  student:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount:      { type: Number, required: true },
  dailyRate:    Number,                                 // snapshot at payment time
  durationDays: Number,
  phone:       { type: String, required: true },       // student phone money is sent to
  reference:   { type: String, required: true, unique: true },
  otpCode:     { type: String, select: false },        // hidden from normal queries
  otpExpiresAt: Date,
  status:      { type: String, enum: ['initiated', 'otp_sent', 'confirmed', 'failed'], default: 'initiated' },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  confirmedAt: Date,
}, { timestamps: true }));
