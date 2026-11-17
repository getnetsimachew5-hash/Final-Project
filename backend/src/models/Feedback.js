const mongoose = require('mongoose');

module.exports = mongoose.model('Feedback', new mongoose.Schema({
  name:       { type: String, default: 'Anonymous' },
  role:       { type: String, enum: ['student', 'cs_dept', 'college', 'academic_vp', 'admin_vp', 'industrial', 'finance', 'admin', 'staff', 'visitor', 'anonymous'], default: 'anonymous' },
  kind:       { type: String, enum: ['complaint', 'comment', 'suggestion'], default: 'comment' },
  category:   { type: String, default: 'General' },
  message:    { type: String, required: true, maxlength: 1000 },
  reply:      { type: String, default: '' },
  repliedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isPublic:   { type: Boolean, default: true },
  hidden:     { type: Boolean, default: false },
}, { timestamps: true }));

