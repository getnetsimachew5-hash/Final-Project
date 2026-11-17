const mongoose = require('mongoose');

/**
 * Notifications double as the system-wide message inbox.
 *
 * Every logical message is fanned out to one row per recipient so each user
 * keeps their own read/unread state. Rows that belong to the same logical
 * message share `messageKey`; rows that belong to the same conversation share
 * `threadId`. That lets an office (CS Department, College, …) exchange a
 * threaded conversation with another office or a student without exposing
 * one user's private read state to the rest of the office.
 */
module.exports = mongoose.model('Notification', new mongoose.Schema({
  recipient:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  recipientRole: { type: String, index: true },

  // Sender is optional: older system notifications have no human sender.
  sender:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  senderRole: String,
  senderName: String,

  subject:  { type: String, trim: true },
  message:  { type: String, required: true },
  type:     { type: String, default: 'info' },
  category: { type: String, default: 'notification', index: true },

  // Portal page this notification points to (e.g. /academic-vp/approved).
  link: { type: String },

  // Conversation/thread metadata.
  threadId:   { type: String, index: true },
  messageKey: { type: String, index: true },
  replyTo:    { type: String },

  // Optional business context so the recipient can jump straight to it.
  batch:   { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentBatch' },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },

  // A request stays "open" until the recipient replies with corrected data
  // or the office that asked marks it resolved.
  actionRequired: { type: Boolean, default: false, index: true },
  resolvedAt:     Date,
  resolvedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  isRead: { type: Boolean, default: false, index: true },
}, { timestamps: true }));
