const mongoose = require('mongoose');

module.exports = mongoose.model('AuditLog', new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action:     { type: String, required: true },
  targetId:   mongoose.Schema.Types.ObjectId,
  targetType: String,
  meta:       Object,
  ipAddress:  String,
  at:         { type: Date, default: Date.now },
}));
