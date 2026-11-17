const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Batch = require('../models/PaymentBatch');
const AuditLog = require('../models/AuditLog');
const {
  OFFICE_ROLES,
  labelFor,
  allowedTargetsFor,
  canMessageRole,
  activeUsersForRole,
  activeUserById,
  deliver,
  markResolved,
} = require('../services/message.service');

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function logicalKey(n) {
  return n.messageKey || String(n._id);
}

function serialize(n, extra = {}) {
  return {
    ...n,
    messageKey: logicalKey(n),
    threadId: n.threadId || String(n._id),
    senderLabel: n.senderName || labelFor(n.senderRole),
    recipientLabel: labelFor(n.recipientRole),
    ...extra,
  };
}

function pageParams(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  return { page, limit };
}

function isParticipant(doc, userId) {
  return String(doc.recipient) === String(userId) || String(doc.sender) === String(userId);
}

/**
 * GET /api/messages?box=inbox|sent
 */
exports.listMessages = async (req, res) => {
  try {
    const box = req.query.box === 'sent' ? 'sent' : 'inbox';
    const { page, limit } = pageParams(req);
    const q = String(req.query.q || '').trim();
    const category = String(req.query.category || '').trim();
    const unreadOnly = req.query.unread === 'true' || req.query.unread === '1';

    const query = box === 'sent'
      ? { sender: req.user._id }
      : { recipient: req.user._id };

    if (category) query.category = category;
    if (unreadOnly && box === 'inbox') query.isRead = false;
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      query.$or = [
        { subject: rx },
        { message: rx },
        { senderName: rx },
      ];
    }

    if (box === 'sent') {
      // One logical message is stored once per recipient. The sender should
      // see the conversation once, with a recipient count — not N copies.
      const rows = await Notification.find(query)
        .populate('student', 'fullName')
        .sort('-createdAt')
        .limit(2000)
        .lean();
      const seen = new Map();
      for (const row of rows) {
        const key = logicalKey(row);
        if (!seen.has(key)) {
          seen.set(key, serialize(row, {
            recipientCount: 1,
            studentName: row.student?.fullName || null,
          }));
        } else {
          seen.get(key).recipientCount += 1;
        }
      }
      const all = [...seen.values()];
      const total = all.length;
      const start = (page - 1) * limit;
      return res.json({
        messages: all.slice(start, start + limit),
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit)),
        box,
      });
    }

    const total = await Notification.countDocuments(query);
    const rows = await Notification.find(query)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({
      messages: rows.map(row => serialize(row)),
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      box,
    });
  } catch (error) {
    console.error('List messages error:', error);
    res.status(500).json({ message: 'Failed to load messages.' });
  }
};

/**
 * GET /api/messages/unread-count
 */
exports.unreadCount = async (req, res) => {
  try {
    const [count, actionRequired] = await Promise.all([
      Notification.countDocuments({ recipient: req.user._id, isRead: false }),
      Notification.countDocuments({
        recipient: req.user._id,
        actionRequired: true,
        resolvedAt: null,
      }),
    ]);
    res.json({ count, actionRequired });
  } catch (error) {
    console.error('Unread count error:', error);
    res.status(500).json({ message: 'Failed to count unread messages.' });
  }
};

/**
 * GET /api/messages/threads/:threadId
 * Opens a conversation and marks the current user's copies as read.
 */
exports.getThread = async (req, res) => {
  try {
    const raw = String(req.params.threadId || '');
    if (!raw) return res.status(400).json({ message: 'Thread id is required.' });

    let rows = await Notification.find({ threadId: raw })
      .populate('student', 'fullName').sort('createdAt').lean();

    // A conversation is shared by the whole office: every participant may read
    // all messages, including replies written by a colleague. Non-participants
    // must not be able to open the thread.
    if (rows.length > 0 && !rows.some(r => isParticipant(r, req.user._id))) {
      return res.status(404).json({ message: 'Conversation not found.' });
    }

    // Backwards compatibility: old notifications have no threadId. A click on
    // one of them passes the notification _id instead.
    if (rows.length === 0 && mongoose.Types.ObjectId.isValid(raw)) {
      const one = await Notification.findById(raw).lean();
      if (!one || !isParticipant(one, req.user._id)) {
        return res.status(404).json({ message: 'Conversation not found.' });
      }
      if (one.threadId) {
        rows = await Notification.find({ threadId: one.threadId })
          .populate('student', 'fullName').sort('createdAt').lean();
      } else {
        rows = [one];
      }
    }

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Conversation not found.' });
    }

    // Collapse the per-recipient copies into one logical message. Prefer the
    // copy addressed to the current user so `isRead` is their own state.
    const byKey = new Map();
    for (const row of rows) {
      const key = logicalKey(row);
      const existing = byKey.get(key);
      const mine = String(row.recipient) === String(req.user._id);
      if (!existing || (mine && String(existing.recipient) !== String(req.user._id))) {
        byKey.set(key, row);
      }
    }

    const messages = [...byKey.values()]
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map(row => serialize(row, {
        // The current user's own copy carries their read state. Messages sent
        // by a colleague to another office are visible for context but are not
        // unread for this user.
        isRead: String(row.recipient) === String(req.user._id) ? row.isRead : true,
      }));

    const threadId = rows[0].threadId || String(rows[0]._id);
    await Notification.updateMany(
      {
        recipient: req.user._id,
        isRead: false,
        $or: [
          ...(rows[0].threadId ? [{ threadId: rows[0].threadId }] : []),
          { _id: { $in: rows.map(r => r._id) } },
        ],
      },
      { $set: { isRead: true } },
    );

    const first = messages[0] || {};
    const participants = [];
    const seenPeople = new Set();
    for (const m of messages) {
      if (m.senderRole && m.senderRole !== req.user.role) {
        const key = m.senderRole;
        if (!seenPeople.has(key)) {
          seenPeople.add(key);
          participants.push({ role: m.senderRole, label: labelFor(m.senderRole), name: m.senderName });
        }
      }
      if (m.recipientRole && m.recipientRole !== req.user.role) {
        const key = m.recipientRole;
        if (!seenPeople.has(key)) {
          seenPeople.add(key);
          participants.push({
            role: m.recipientRole,
            label: labelFor(m.recipientRole),
            name: m.recipientRole === 'student' ? (m.student?.fullName || undefined) : undefined,
          });
        }
      }
    }

    res.json({
      threadId,
      subject: first.subject || 'Conversation',
      messages,
      participants,
      context: {
        batch: first.batch || null,
        student: first.student?._id || first.student || null,
        link: first.link || null,
      },
      actionRequired: messages.some(m => m.actionRequired && !m.resolvedAt),
      canReply: messages.some(m =>
        Boolean(m.sender)
        || (m.senderRole && m.senderRole !== req.user.role)
        || (m.recipientRole && m.recipientRole !== req.user.role)),
    });
  } catch (error) {
    console.error('Get thread error:', error);
    res.status(500).json({ message: 'Failed to open the conversation.' });
  }
};

/**
 * POST /api/messages
 * Body: { toRole?, toUserId?, subject?, message, replyTo?, threadId?,
 *         batchId?, studentId?, actionRequired? }
 */
exports.sendMessage = async (req, res) => {
  try {
    const text = String(req.body?.message || '').trim();
    if (!text) return res.status(400).json({ message: 'Please type a message.' });
    if (text.length > 4000) {
      return res.status(400).json({ message: 'Message is too long (maximum 4000 characters).' });
    }

    const replyToId = req.body?.replyTo ? String(req.body.replyTo) : null;
    const threadIdInput = req.body?.threadId ? String(req.body.threadId) : null;

    let recipients = [];
    let targetRole = null;
    let threadId;
    let replyTo;
    let subject = String(req.body?.subject || '').trim();
    let batch = req.body?.batchId || null;
    let student = req.body?.studentId || null;
    const wantsAction = req.body?.actionRequired === true || req.body?.actionRequired === 'true';
    let category = req.body?.category === 'request' || wantsAction ? 'request' : 'message';
    let actionRequired = wantsAction;
    let original = null;
    let threadRows = [];

    if (replyToId || threadIdInput) {
      if (replyToId) {
        if (!mongoose.Types.ObjectId.isValid(replyToId)) {
          return res.status(400).json({ message: 'Invalid message to reply to.' });
        }
        original = await Notification.findById(replyToId).lean();
        if (original?.threadId) {
          threadRows = await Notification.find({
            threadId: original.threadId,
          }).sort('-createdAt').lean();
        } else if (original) {
          // Legacy notification without a thread: still use it as the only
          // row so replies go to its external sender/recipient, not inward.
          threadRows = [original];
        }
      } else {
        threadRows = await Notification.find({
          threadId: threadIdInput,
        }).sort('-createdAt').lean();
        original = threadRows.find(r => r.sender && String(r.sender) !== String(req.user._id))
          || threadRows.find(r => r.senderRole && r.senderRole !== req.user.role)
          || threadRows[0];
      }

      if (!original) return res.status(404).json({ message: 'The message you are replying to was not found.' });
      const threadParticipant = threadRows.length > 0
        ? threadRows.some(r => isParticipant(r, req.user._id))
        : isParticipant(original, req.user._id);
      if (!threadParticipant) {
        return res.status(403).json({ message: 'You are not part of this conversation.' });
      }
      if (!original.sender && !original.senderRole) {
        return res.status(400).json({
          message: 'This is a system notification, so it has no sender to reply to. Use “New message” instead.',
        });
      }

      // Work out the other side of the conversation. An office can have more
      // than one user, so the latest message may have been written by a
      // colleague. Looking only at the latest sender would send the reply to
      // our own office instead of the external office/student. Prefer the
      // latest message from a role other than the current user's role.
      const externalRoles = new Set();
      for (const r of threadRows) {
        if (r.senderRole && r.senderRole !== req.user.role) externalRoles.add(r.senderRole);
        if (r.recipientRole && r.recipientRole !== req.user.role) externalRoles.add(r.recipientRole);
      }

      let replyTargetRole = null;
      if (externalRoles.size > 0) {
        const latestExternal = threadRows.find(r => r.senderRole && externalRoles.has(r.senderRole))
          || threadRows.find(r => r.recipientRole && externalRoles.has(r.recipientRole));
        replyTargetRole = latestExternal?.senderRole && externalRoles.has(latestExternal.senderRole)
          ? latestExternal.senderRole
          : (latestExternal?.recipientRole || null);
      } else {
        // Same-office conversation: reply to the colleague(s) in the office.
        replyTargetRole = req.user.role;
      }

      if (!replyTargetRole) {
        return res.status(400).json({ message: 'This conversation has no other participant to reply to.' });
      }
      if (!canMessageRole(req.user.role, replyTargetRole)) {
        return res.status(403).json({ message: `You cannot reply to the ${labelFor(replyTargetRole)}.` });
      }

      targetRole = replyTargetRole;
      let replyStudentId = null;
      if (targetRole === 'student') {
        replyStudentId = original.student
          || threadRows.find(r => r.senderRole === 'student' && r.sender)?.sender
          || threadRows.find(r => r.recipientRole === 'student' && r.recipient)?.recipient;
        if (!replyStudentId) {
          return res.status(400).json({ message: 'This conversation has no student to reply to.' });
        }
        const studentUser = await activeUserById(replyStudentId);
        if (!studentUser || studentUser.role !== 'student') {
          return res.status(400).json({ message: 'The student account is no longer active.' });
        }
        recipients = [studentUser];
      } else {
        recipients = await activeUsersForRole(targetRole);
      }

      threadId = original.threadId || original.messageKey || String(original._id);
      replyTo = original.messageKey || String(original._id);
      if (!subject) {
        const baseSubject = String(original.subject || String(original.message || '').slice(0, 80))
          .replace(/^(re:\s*)+/i, '');
        subject = `Re: ${baseSubject}`;
      }
      if (!batch) batch = original.batch;
      if (!student) {
        student = original.student || replyStudentId;
      }
      category = actionRequired ? 'request' : 'reply';
    } else {
      const toUserId = req.body?.toUserId ? String(req.body.toUserId) : null;
      const toRole = req.body?.toRole ? String(req.body.toRole) : null;

      if (!toUserId && !toRole) {
        return res.status(400).json({ message: 'Choose who should receive the message.' });
      }

      if (toUserId) {
        if (!mongoose.Types.ObjectId.isValid(toUserId)) {
          return res.status(400).json({ message: 'Invalid recipient.' });
        }
        const target = await activeUserById(toUserId);
        if (!target) return res.status(400).json({ message: 'The selected recipient is not an active user.' });
        targetRole = target.role;
        if (!canMessageRole(req.user.role, targetRole)) {
          return res.status(403).json({ message: `You cannot message the ${labelFor(targetRole)}.` });
        }
        recipients = [target];
      } else {
        targetRole = toRole;
        if (!canMessageRole(req.user.role, targetRole)) {
          return res.status(403).json({ message: `You cannot message the ${labelFor(targetRole)}.` });
        }
        if (targetRole === 'student') {
          return res.status(400).json({
            message: 'Choose a specific student so the request reaches the right person.',
          });
        }
        recipients = await activeUsersForRole(targetRole);
      }

      if (!student && targetRole === 'student' && recipients.length === 1) {
        student = recipients[0]._id;
      }
      if (!subject) subject = `Message from ${labelFor(req.user.role)}`;
    }

    if (!recipients.length) {
      return res.status(400).json({ message: `There are no active users in the ${labelFor(targetRole)}.` });
    }

    if (batch) {
      if (!mongoose.Types.ObjectId.isValid(String(batch))) {
        return res.status(400).json({ message: 'Invalid batch reference.' });
      }
      const exists = await Batch.exists({ _id: batch });
      if (!exists) return res.status(400).json({ message: 'The referenced batch was not found.' });
    }

    if (student) {
      if (!mongoose.Types.ObjectId.isValid(String(student))) {
        return res.status(400).json({ message: 'Invalid student reference.' });
      }
      const exists = await User.exists({ _id: student, role: 'student' });
      if (!exists) return res.status(400).json({ message: 'The referenced student was not found.' });
    }

    const result = await deliver({
      sender: req.user,
      recipients,
      subject,
      message: text,
      category,
      link: req.body?.link || undefined,
      batch: batch || undefined,
      student: student || undefined,
      actionRequired,
      threadId,
      replyTo,
    });

    if (result.inserted === 0) {
      return res.status(400).json({ message: 'The message was not sent — the recipient list was empty.' });
    }

    // A reply that supplies the corrected information closes the open request
    // from the other side. The latest message may be a colleague's reply, so
    // search the whole conversation instead of only checking `original`.
    const openRequest = threadRows.find(r =>
      r.actionRequired && !r.resolvedAt && r.senderRole && r.senderRole !== req.user.role,
    ) || (original?.actionRequired && !original.resolvedAt && original.senderRole !== req.user.role
      ? original
      : null);

    if (openRequest && !actionRequired) {
      await markResolved({
        messageKey: openRequest.messageKey,
        threadId: openRequest.threadId,
        resolvedBy: req.user._id,
      });
    }

    await AuditLog.create({
      user: req.user._id,
      action: replyTo ? 'reply_message' : 'send_message',
      targetId: recipients[0]?._id,
      targetType: 'Notification',
      meta: {
        toRole: targetRole,
        recipients: result.inserted,
        subject,
        threadId: result.threadId,
        category,
        actionRequired,
        batch: batch ? String(batch) : undefined,
        student: student ? String(student) : undefined,
      },
    });

    res.status(201).json({
      ok: true,
      sent: result.inserted,
      message: `Message sent to ${result.inserted} ${labelFor(targetRole)} user(s).`,
      threadId: result.threadId,
      messageKey: result.messageKey,
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Failed to send the message. Please try again.' });
  }
};

/**
 * POST /api/messages/read
 * Body: { ids?: [], threadId?: string }
 */
exports.markRead = async (req, res) => {
  try {
    const { ids, threadId } = req.body || {};
    if (threadId) {
      const result = await Notification.updateMany(
        { recipient: req.user._id, threadId: String(threadId), isRead: false },
        { $set: { isRead: true } },
      );
      return res.json({ ok: true, marked: result.modifiedCount || 0 });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Message IDs or a thread ID are required.' });
    }

    const result = await Notification.updateMany(
      { recipient: req.user._id, _id: { $in: ids } },
      { $set: { isRead: true } },
    );
    res.json({ ok: true, marked: result.modifiedCount || 0 });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ message: 'Failed to mark messages as read.' });
  }
};

/**
 * GET /api/messages/contacts
 * Roles the current user may start a conversation with.
 */
exports.contacts = async (req, res) => {
  try {
    const roles = allowedTargetsFor(req.user.role);
    const counts = await User.aggregate([
      { $match: { role: { $in: roles }, accountStatus: 'active' } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]);
    const byRole = new Map(counts.map(c => [c._id, c.count]));

    // For the user's own role, exclude the user themselves. If they are the
    // only person in that office there is nobody else to message, so the
    // option is hidden instead of failing after the user presses Send.
    const targets = roles
      .map(role => {
        const raw = byRole.get(role) || 0;
        return {
          role,
          label: role === 'student' ? 'Student (choose one)' : labelFor(role),
          count: role === req.user.role ? Math.max(0, raw - 1) : raw,
        };
      })
      .filter(item => item.role !== req.user.role || item.count > 0);

    res.json({
      me: {
        id: req.user._id,
        fullName: req.user.fullName,
        role: req.user.role,
        label: labelFor(req.user.role),
      },
      roles: targets,
    });
  } catch (error) {
    console.error('Contacts error:', error);
    res.status(500).json({ message: 'Failed to load message recipients.' });
  }
};

/**
 * GET /api/messages/students?q=
 * Staff-only student picker for a targeted message.
 */
exports.searchStudents = async (req, res) => {
  try {
    if (req.user.role === 'student') {
      return res.status(403).json({ message: 'Students can only message offices.' });
    }

    const q = String(req.query.q || '').trim();
    const query = { role: 'student', accountStatus: 'active' };
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      query.$or = [
        { fullName: rx },
        { institutionalId: rx },
        { username: rx },
        { program: rx },
      ];
    }

    const students = await User.find(query)
      .select('_id fullName institutionalId program year username')
      .sort('fullName')
      .limit(25)
      .lean();

    res.json({ students });
  } catch (error) {
    console.error('Search students error:', error);
    res.status(500).json({ message: 'Failed to search students.' });
  }
};

module.exports.OFFICE_ROLES = OFFICE_ROLES;
