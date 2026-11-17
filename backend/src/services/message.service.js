const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const User = require('../models/User');

/**
 * Central helper for every cross-actor message.
 *
 * Keeping fan-out in one place means the CS Department, College, Academic VP,
 * Admin VP, Finance, Admin and students all use exactly the same data shape,
 * so a conversation started by one office can be replied to by another.
 */

const ROLE_LABELS = {
  student: 'Student',
  cs_dept: 'CS Department',
  college: 'College Office',
  academic_vp: 'Academic Vice President',
  admin_vp: 'Administrative Vice President',
  finance: 'Finance Office',
  admin: 'System Administrator',
  industrial: 'Industrial Supervisor',
};

const OFFICE_ROLES = ['cs_dept', 'college', 'academic_vp', 'admin_vp', 'finance', 'admin'];

// Who may start a new conversation with whom. Every office can talk to the
// students it serves and to the other offices; students can talk to any office.
const ALLOWED_TARGETS = {
  student: [...OFFICE_ROLES],
  cs_dept: ['student', 'college', 'academic_vp', 'admin_vp', 'finance', 'admin', 'cs_dept'],
  college: ['student', 'cs_dept', 'academic_vp', 'admin_vp', 'finance', 'admin', 'college'],
  academic_vp: ['student', 'cs_dept', 'college', 'admin_vp', 'finance', 'admin', 'academic_vp'],
  admin_vp: ['student', 'cs_dept', 'college', 'academic_vp', 'finance', 'admin', 'admin_vp'],
  finance: ['student', 'cs_dept', 'college', 'academic_vp', 'admin_vp', 'admin', 'finance'],
  admin: ['student', ...OFFICE_ROLES],
};

function labelFor(role) {
  return ROLE_LABELS[role] || role || 'System';
}

function allowedTargetsFor(role) {
  return ALLOWED_TARGETS[role] || [];
}

function canMessageRole(fromRole, toRole) {
  return allowedTargetsFor(fromRole).includes(toRole);
}

async function activeUsersForRole(role) {
  return User.find({ role, accountStatus: 'active' })
    .select('_id fullName username institutionalId role program year');
}

async function activeUserById(id) {
  return User.findOne({ _id: id, accountStatus: 'active' })
    .select('_id fullName username institutionalId role program year');
}

/**
 * Create one inbox row per recipient.
 *
 * @param {Object} opts
 * @param {Object|string} opts.sender      User document or user id (optional)
 * @param {Array<Object|string>} opts.recipients User docs or ids
 * @param {string} opts.subject
 * @param {string} opts.message
 * @param {string} [opts.category]         request | reply | resubmission | workflow | message
 * @param {string} [opts.type]             legacy notification type
 * @param {string} [opts.link]             portal page for the recipient
 * @param {string|ObjectId} [opts.batch]
 * @param {string|ObjectId} [opts.student]
 * @param {boolean} [opts.actionRequired]
 * @param {string} [opts.threadId]         continue an existing conversation
 * @param {string} [opts.replyTo]          messageKey/id being replied to
 */
async function deliver({
  sender,
  recipients,
  subject,
  message,
  category = 'message',
  type,
  link,
  batch,
  student,
  actionRequired = false,
  threadId,
  replyTo,
}) {
  const ids = (recipients || [])
    .map(r => (r && r._id ? r._id : r))
    .filter(Boolean)
    .map(String);

  if (ids.length === 0) return { inserted: 0, messageKey: null, threadId: null };

  const senderDoc = sender && !sender.fullName && !sender.role
    ? await User.findById(sender).select('_id fullName role username')
    : sender;

  const users = await User.find({ _id: { $in: ids } }).select('_id fullName role');
  const byId = new Map(users.map(u => [String(u._id), u]));

  const senderId = senderDoc?._id ? String(senderDoc._id) : null;
  const messageKey = new mongoose.Types.ObjectId().toString();
  const tid = threadId || messageKey;

  const rows = [];
  for (const id of ids) {
    const user = byId.get(id);
    if (!user) continue;
    if (senderId && String(user._id) === senderId) continue; // never message yourself
    rows.push({
      recipient: user._id,
      recipientRole: user.role,
      sender: senderDoc?._id,
      senderRole: senderDoc?.role,
      senderName: senderDoc?.fullName,
      subject: subject ? String(subject).slice(0, 240) : undefined,
      message: String(message),
      category,
      type: type || (category === 'request' ? 'missing_info' : 'message'),
      link,
      batch: batch || undefined,
      student: student || undefined,
      actionRequired: Boolean(actionRequired),
      threadId: tid,
      messageKey,
      replyTo: replyTo || undefined,
    });
  }

  if (rows.length === 0) return { inserted: 0, messageKey: null, threadId: null };

  const inserted = await Notification.insertMany(rows);
  return { inserted: inserted.length, messageKey, threadId: tid, rows: inserted };
}

/** Mark a request/thread resolved once the missing data has been supplied. */
async function markResolved({ messageKey, threadId, resolvedBy }) {
  const query = messageKey ? { messageKey } : { threadId };
  if (!messageKey && !threadId) return 0;
  const result = await Notification.updateMany(query, {
    $set: {
      actionRequired: false,
      resolvedAt: new Date(),
      resolvedBy: resolvedBy || undefined,
    },
  });
  return result.modifiedCount || 0;
}

module.exports = {
  ROLE_LABELS,
  OFFICE_ROLES,
  labelFor,
  allowedTargetsFor,
  canMessageRole,
  activeUsersForRole,
  activeUserById,
  deliver,
  markResolved,
};
