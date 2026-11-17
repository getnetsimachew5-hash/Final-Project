const mongoose = require('mongoose');

module.exports = mongoose.model('CompletionLetter', new mongoose.Schema({
  return:     { type: mongoose.Schema.Types.ObjectId, ref: 'InternshipReturn', required: true, unique: true },
  student:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filePath:   { type: String, required: true },
  fileType:   String,
  fileSize:   Number,
  isVerified: { type: Boolean, default: false },
}, { timestamps: true }));