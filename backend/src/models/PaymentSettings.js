const mongoose = require('mongoose');

// Global finance settings for internship payments.
// The stipend is computed as:  dailyRate (ETB) × duration in days.
// duration = (endDate - startDate) + 1 (both start and end days count).
module.exports = mongoose.model('PaymentSettings', new mongoose.Schema({
  dailyRate: { type: Number, default: 100, min: 0 },   // ETB per day
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true }));
