const mongoose = require('mongoose');

module.exports = mongoose.model('Organization', new mongoose.Schema({
  orgName:    { type: String, required: true, unique: true },
  orgAddress: { type: String, required: true },
  sector:     String,
  addedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true }));
