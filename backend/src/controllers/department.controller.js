const { STUDENT_POPULATE } = require('../utils/studentFields');
const { studentMissingInfo } = require('../utils/studentCompleteness');
const Return   = require('../models/InternshipReturn');
const Letter   = require('../models/CompletionLetter');
const Batch    = require('../models/PaymentBatch');
const Request  = require('../models/PaymentRequest');
const User     = require('../models/User');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const workflow = require('../services/workflow.service');
const telebirr = require('../services/telebirr.service');
const { deliver, markResolved } = require('../services/message.service');
const { internshipDays } = require('../utils/dates');
const { normalizePhone } = require('../utils/paymentPhone');
const {
  batchIdentity,
  batchIdentityFilter,
  nextBatchCode,
} = require('../utils/batchIdentity');

/* ------------------------------------------------------------------ *
 * "One student, one payment" guard
 * A student who is already in a batch that has not been rejected must not
 * be added to another batch. `paid` is included on purpose: a student is
 * paid only once. A rejected/cancelled batch — or a request rejected for that
 * student — releases them so the CS Department can correct the information
 * and create a new batch.
 * ------------------------------------------------------------------ */
const RELEASED_BATCH_STATUS = 'rejected';

function studentIdOfRequest(request) {
  return String(request.student?._id || request.student || '');
}

function batchInfoFromRequest(request) {
  const batch = request?.batch;
  if (!batch || typeof batch !== 'object' || !batch._id) return null;
  return {
    batchId: String(batch._id),
    batchName: batch.batchName || '',
    batchCode: batch.batchCode || '',
    batchMonth: batch.batchMonth || '',
    semester: batch.semester || '',
    academicYear: batch.academicYear || '',
    status: batch.status || '',
    requestStatus: request.status || '',
  };
}

async function findBatchConflicts(studentIds, { excludeBatchId } = {}) {
  const ids = [...new Set(studentIds.map(String))];
  if (ids.length === 0) return [];

  const requests = await Request.find({ student: { $in: ids } })
    .populate('batch', 'batchName batchCode status')
    .populate('student', 'fullName institutionalId');

  const conflicts = new Map();
  for (const request of requests) {
    const batch = request.batch;
    if (!batch || batch.status === RELEASED_BATCH_STATUS) continue;
    // A request rejected for this student can never be paid, so it does not
    // hold the student; they may be corrected and batched again.
    if (request.status === 'rejected') continue;
    // The CS Department explicitly released this paid request so a new cycle
    // can be created after the student corrects their information.
    if (request.reopenedAt) continue;
    if (excludeBatchId && String(batch._id) === String(excludeBatchId)) continue;
    const sid = studentIdOfRequest(request);
    if (!conflicts.has(sid)) conflicts.set(sid, request);
  }

  return [...conflicts.values()];
}

function batchConflictMessage(conflicts) {
  const preview = conflicts.slice(0, 5).map((request) => {
    const student = request.student?.fullName
      || request.student?.institutionalId
      || 'Unknown student';
    const batch = request.batch;
    const where = batch?.batchCode
      ? `${batch.batchName} (${batch.batchCode})`
      : (batch?.batchName || 'another batch');
    const stage = String(batch?.status || '').replace(/_/g, ' ');
    return `${student} — ${where}${stage ? ` · ${stage}` : ''}`;
  });
  const more = conflicts.length > preview.length
    ? ` and ${conflicts.length - preview.length} more`
    : '';

  return `${conflicts.length} selected student(s) are already in another batch and can only be selected once: ${preview.join('; ')}${more}. Paid students are never added again. Edit or cancel the existing batch first.`;
}

/* ------------------------------------------------------------------ *
 * Student Submissions
 * Returns every internship return form plus the completion letters that
 * belong to them. The letter is matched by its `return` ObjectId.
 * ------------------------------------------------------------------ */
exports.listSubmissions = async (req, res) => {
  const returns = await Return.find()
    .populate('student', STUDENT_POPULATE)
    .populate('verifiedBy', 'fullName')
    .sort('-createdAt');

  const letters = await Letter.find({ return: { $in: returns.map(r => r._id) } })
    .populate('student', STUDENT_POPULATE);

  const letterByReturn = new Map(letters.map(l => [String(l.return), l]));

  // Load every payment request for these students once, then determine which
  // batch currently owns each student. A student in a non-rejected batch is
  // already "taken": paid students must never be selected again, and students
  // in an unfinished batch must not be duplicated in a new one. Rejected or
  // cancelled batches release their students for correction/re-batching.
  const studentIds = returns.map(r => r.student?._id).filter(Boolean);
  const requests = studentIds.length
    ? await Request.find({ student: { $in: studentIds } })
      .populate('batch', 'batchName batchCode batchMonth semester academicYear status')
      .sort('-createdAt')
    : [];

  const activeRequestByStudent = new Map();
  const rejectedRequestByStudent = new Map();
  const reopenedRequestByStudent = new Map();

  for (const request of requests) {
    if (!request.batch) continue;
    const sid = studentIdOfRequest(request);
    // A paid request released by the CS Department stays in history but no
    // longer owns the student. It is shown as the previous batch.
    if (request.reopenedAt) {
      if (!reopenedRequestByStudent.has(sid)) {
        reopenedRequestByStudent.set(sid, request);
      }
      continue;
    }
    // A cancelled/rejected BATCH releases every student. A student rejected
    // individually at the College stage is also released: that rejected request
    // can never be paid, so the CS Department may correct the details and batch
    // the student again. All other requests still hold their student.
    if (
      request.batch.status === RELEASED_BATCH_STATUS ||
      request.status === 'rejected'
    ) {
      if (!rejectedRequestByStudent.has(sid)) {
        rejectedRequestByStudent.set(sid, request);
      }
      continue;
    }
    const current = activeRequestByStudent.get(sid);
    // Prefer a paid request when legacy data has duplicates for one student.
    if (!current || (request.status === 'paid' && current.status !== 'paid')) {
      activeRequestByStudent.set(sid, request);
    }
  }

  // Enrich every submission with the automatic payment calculation, the
  // registered TeleBirr phone and the COMPLETE missing-information checklist
  // (same helper the student portal and the College Office use, so all three
  // actors always see exactly the same list). Never expose
  // passwordHash/plainPassword here: a batch creator needs student records,
  // not login credentials.
  const enriched = returns.map(r => {
    const obj = r.toObject();
    const student = obj.student || null;
    const letter = letterByReturn.get(String(r._id)) || null;
    const missingInfo = studentMissingInfo(student, obj, letter);

    let durationDays = 0;
    if (obj.startDate && obj.endDate) {
      durationDays = internshipDays(obj.startDate, obj.endDate);
    }

    const sid = String(obj.student?._id || obj.student || '');
    const activeRequest = activeRequestByStudent.get(sid) || null;
    const batchInfo = batchInfoFromRequest(activeRequest);
    const previousRequest = rejectedRequestByStudent.get(sid)
      || reopenedRequestByStudent.get(sid)
      || null;

    const paymentStatus = !batchInfo
      ? 'not_batched'
      : (activeRequest.status === 'paid' || batchInfo.status === 'paid' ? 'paid' : 'pending');

    return {
      ...obj,
      studentPhone: normalizePhone(student?.phone),
      dailyRate: 100,
      durationDays,
      balance: 100 * durationDays,
      missingInfo,
      complete: missingInfo.length === 0,
      // "One student, one payment" information used by the CS Department UI.
      paymentStatus,
      batchInfo,
      alreadyBatched: Boolean(batchInfo),
      previousBatch: previousRequest ? batchInfoFromRequest(previousRequest) : null,
      paymentReopenAllowed: Boolean(student?.paymentReopenAllowed),
      paymentReopenReason: student?.paymentReopenReason || '',
      paymentReopenGrantedAt: student?.paymentReopenGrantedAt || null,
      paymentReopenRequestedAt: student?.paymentReopenRequestedAt || null,
    };
  });

  res.json({ returns: enriched, letters });
};

/* ------------------------------------------------------------------ *
 * Verify Students
 * Mark a student's return as checked (all documents present and correct),
 * or undo that check.
 * ------------------------------------------------------------------ */
exports.verifyReturn = async (req, res) => {
  const ret = await Return.findById(req.params.id).populate('student', STUDENT_POPULATE);
  if (!ret) return res.status(404).json({ message: 'Submission not found' });

  const letter = await Letter.findOne({ return: ret._id });
  if (!letter)
    return res.status(400).json({ message: 'No completion letter uploaded for this student yet' });

  // The server enforces the same checklist the page shows: a record cannot be
  // verified while any required item is missing (phone, program, org name,
  // supervisor, dates, letter…), not just the letter.
  const missingInfo = studentMissingInfo(ret.student, ret, letter);
  if (missingInfo.length > 0) {
    return res.status(400).json({
      message: `Cannot verify yet — ${missingInfo.length} required item(s) are still missing.`,
      missingInfo,
    });
  }

  ret.verified   = true;
  ret.verifiedAt = new Date();
  ret.verifiedBy = req.user._id;
  await ret.save();

  // also flag the uploaded letter as verified
  letter.isVerified = true;
  await letter.save();

  res.json(ret);
};

exports.unverifyReturn = async (req, res) => {
  const ret = await Return.findByIdAndUpdate(
    req.params.id,
    { verified: false, verifiedAt: null, verifiedBy: null },
    { new: true }
  );
  if (!ret) return res.status(404).json({ message: 'Submission not found' });

  await Letter.updateOne({ return: ret._id }, { isVerified: false });
  res.json(ret);
};
/**
 * Reject a student's submission with a reason.
 * Student will receive a notification and can resubmit correct information.
 */
exports.rejectReturn = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    const ret = await Return.findById(req.params.id).populate('student', STUDENT_POPULATE);
    if (!ret) return res.status(404).json({ message: 'Submission not found' });

    // Mark as rejected
    ret.verified = false;
    ret.verifiedAt = null;
    ret.verifiedBy = null;
    ret.status = 'rejected';
    ret.rejectionReason = String(reason).trim();
    await ret.save();

    // Also un-verify the letter
    await Letter.updateOne({ return: ret._id }, { isVerified: false });

    // Notify the student with a replyable request. The student's resubmission
    // is threaded back to this message, so the CS Department sees the answer
    // in the same conversation. Repeated rejections reuse the open thread and
    // supersede the previous request instead of creating duplicate open items.
    const studentId = ret.student?._id || ret.student;
    const existing = await Notification.findOne({
      student: studentId,
      category: 'request',
      actionRequired: true,
      resolvedAt: null,
      senderRole: 'cs_dept',
      type: 'rejection',
    }).sort('-createdAt').select('threadId messageKey');

    if (existing) {
      await markResolved({
        messageKey: existing.messageKey,
        threadId: existing.threadId,
        resolvedBy: req.user._id,
      });
    }

    await deliver({
      sender: req.user,
      recipients: [studentId],
      subject: 'Correction needed on your internship return form',
      message: `Your internship return form was rejected by the CS Department.\n\nReason: ${ret.rejectionReason}\n\nPlease correct the information and resubmit it.`,
      category: 'request',
      type: 'rejection',
      link: '/student/return',
      student: studentId,
      actionRequired: true,
      threadId: existing?.threadId,
      replyTo: existing?.messageKey,
    });

    res.json({
      message: 'Submission rejected. Student has been notified.',
      return: ret,
    });
  } catch (error) {
    console.error('Reject return error:', error);
    res.status(500).json({ message: 'Failed to reject submission' });
  }
};
/* ------------------------------------------------------------------ *
 * Send a message to one student
 * The CS Department can message a student directly (without rejecting
 * the submission). The student sees it on their Notifications page.
 * ------------------------------------------------------------------ */
exports.sendMessage = async (req, res) => {
  try {
    const text = String(req.body?.message || '').trim();
    if (!text) {
      return res.status(400).json({ message: 'Please type a message to send.' });
    }

    const ret = await Return.findById(req.params.id).populate('student', STUDENT_POPULATE);
    if (!ret) return res.status(404).json({ message: 'Submission not found' });

    const studentId = ret.student?._id || ret.student;
    const letter = await Letter.findOne({ return: ret._id });
    const missing = studentMissingInfo(ret.student, ret, letter);
    const student = ret.student || {};

    // Every verification message carries the student's record so the student
    // and the office can talk about the same facts without copy/pasting them.
    const context = [
      `Student: ${student.fullName || 'Unknown'} (${student.institutionalId || 'no ID'})`,
      `Email: ${student.email || 'not provided'}`,
      `Registered TeleBirr phone: ${student.phone || 'missing'}`,
      `Program: ${student.program || 'missing'}`,
      `Year of study: ${student.year ? `Year ${student.year}` : 'missing'}`,
      `Organization: ${ret.orgName || 'missing'}`,
      `Internship dates: ${ret.startDate ? new Date(ret.startDate).toLocaleDateString() : 'missing'} - ${ret.endDate ? new Date(ret.endDate).toLocaleDateString() : 'missing'}`,
      `Missing information: ${missing.length ? missing.join(', ') : 'none'}`,
    ].join('\n');

    await deliver({
      sender: req.user,
      recipients: [studentId],
      subject: 'Message from the CS Department',
      message: `${text}\n\n---\nStudent information for verification:\n${context}`,
      category: 'message',
      type: 'message',
      link: '/student/return',
      student: studentId,
    });

    await AuditLog.create({
      user: req.user._id,
      action: 'send_message_to_student',
      targetId: ret._id,
      targetType: 'InternshipReturn',
      meta: { message: text },
    });

    res.json({
      ok: true,
      message: `Message sent to ${ret.student?.fullName || 'the student'}.`,
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Failed to send message. Please try again.' });
  }
};
/* ------------------------------------------------------------------ *
 * Controlled post-paid update window
 * A student whose payment is complete is locked by default. The CS
 * Department can open one update window for one student, release the old
 * paid request from the "one student, one active payment" guard, and ask
 * the student to correct the record. The permission is consumed when the
 * replacement batch is created.
 * ------------------------------------------------------------------ */
exports.grantAnotherPayment = async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ message: 'Please explain why the student needs another payment.' });
    }

    const student = await User.findById(req.params.studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student account not found' });
    }

    const paidRequests = await Request.find({
      student: student._id,
      status: 'paid',
      reopenedAt: null,
    })
      .populate('batch', 'batchName batchCode status')
      .sort('-createdAt');
    if (paidRequests.length === 0) {
      return res.status(400).json({
        message: 'This student has no completed payment that can be reopened. Use the normal correction flow before payment.',
      });
    }

    const activeRequest = await Request.findOne({
      student: student._id,
      status: { $nin: ['paid', 'rejected'] },
      reopenedAt: null,
    }).populate('batch', 'batchName batchCode status');
    if (activeRequest) {
      return res.status(400).json({
        message: 'This student already has an active payment request. Finish or cancel that batch first.',
      });
    }

    const now = new Date();
    await Request.updateMany(
      { student: student._id, status: 'paid', reopenedAt: null },
      {
        $set: {
          reopenedAt: now,
          reopenedBy: req.user._id,
          reopenReason: reason,
        },
      }
    );

    student.paymentReopenAllowed = true;
    student.paymentReopenReason = reason;
    student.paymentReopenGrantedBy = req.user._id;
    student.paymentReopenGrantedAt = now;
    student.paymentReopenRequestedAt = null;
    await student.save();

    // Reuse one open request conversation for repeated permission grants.
    const existing = await Notification.findOne({
      student: student._id,
      category: 'request',
      actionRequired: true,
      resolvedAt: null,
      senderRole: 'cs_dept',
      type: 'reopen_payment',
    }).sort('-createdAt').select('threadId messageKey');

    if (existing) {
      await markResolved({
        messageKey: existing.messageKey,
        threadId: existing.threadId,
        resolvedBy: req.user._id,
      });
    }

    await deliver({
      sender: req.user,
      recipients: [student._id],
      subject: 'Permission to update your information and request another payment',
      message:
        `The CS Department reviewed your completed payment and opened an update window for your record.\n\n` +
        `Reason: ${reason}\n\n` +
        `Please correct your personal or internship information and resubmit the return form. ` +
        `The CS Department will then create a new payment batch.`,
      category: 'request',
      type: 'reopen_payment',
      link: '/student/return',
      student: student._id,
      actionRequired: true,
      threadId: existing?.threadId,
      replyTo: existing?.messageKey,
    });

    await AuditLog.create({
      user: req.user._id,
      action: 'grant_another_payment',
      targetId: student._id,
      targetType: 'User',
      meta: {
        reason,
        releasedRequests: paidRequests.map(request => String(request._id)),
        previousBatch: paidRequests[0]?.batch?.batchName || '',
      },
    });

    res.json({
      message: `Update permission granted to ${student.fullName}. They can now correct their information; create a new batch after they resubmit.`,
      student: {
        _id: student._id,
        fullName: student.fullName,
        institutionalId: student.institutionalId,
        paymentReopenAllowed: true,
        paymentReopenReason: reason,
        paymentReopenGrantedAt: now,
      },
      releasedRequests: paidRequests.length,
    });
  } catch (error) {
    console.error('Grant another payment error:', error);
    res.status(500).json({ message: 'Failed to grant another payment. Please try again.' });
  }
};

/* ------------------------------------------------------------------ *
 * Batches
 * ------------------------------------------------------------------ */
exports.listBatches = async (req, res) => {
  const batches = await Batch.find()
    .populate('students', STUDENT_POPULATE)
    .populate('createdBy', 'fullName')
    .populate('history.actor', 'fullName role')
    .sort('-createdAt');

  // Fix orphaned actor references: if a user was deleted, the populate returns
  // null â€” attach the raw ObjectId so the audit trail never loses the actor.
  const enriched = batches.map(batch => ({
    ...batch.toObject(),
    history: (batch.history || []).map(h => ({
      ...h,
      actor: h.actor && typeof h.actor === 'object' && h.actor._id
        ? h.actor
        : h.actor
          ? { _id: h.actor, fullName: 'Deleted user', role: 'unknown' }
          : h.actor,
    })),
  }));

  res.json(enriched);
};

/* Single batch â€” used by the "Edit batch" form. */
exports.getBatch = async (req, res) => {
  const batch = await Batch.findById(req.params.id)
    .populate('students', STUDENT_POPULATE)
    .populate('createdBy', 'fullName')
    .populate('history.actor', 'fullName role');
  if (!batch) return res.status(404).json({ message: 'Batch not found' });
  res.json(batch);
};

/**
 * Load the registered account phone for every selected student. Batch creation
 * is blocked when a student has no phone, because TeleBirr cannot pay them.
 */
async function registeredPhonesFor(studentIds) {
  const ids = [...new Set(studentIds.map(String))];
  const students = await User.find({ _id: { $in: ids }, role: 'student' })
    .select('fullName institutionalId phone')
    .lean();
  const studentById = new Map(students.map(student => [String(student._id), student]));

  const missing = ids.filter(id => !normalizePhone(studentById.get(id)?.phone));
  if (missing.length > 0) {
    return {
      studentById,
      error: `${missing.length} selected student(s) have no registered phone number. Ask them to update their account before creating the batch.`,
    };
  }

  return { studentById, error: '' };
}

exports.createBatch = async (req, res) => {
  try {
    const { batchName, semester, academicYear, batchMonth, studentIds } = req.body;

    if (!String(batchName || '').trim())
      return res.status(400).json({ message: 'Batch name is required' });
    if (!String(academicYear || '').trim())
      return res.status(400).json({ message: 'Academic year is required' });
    if (!Array.isArray(studentIds) || studentIds.length === 0)
      return res.status(400).json({ message: 'Select at least one student' });

    const uniqueIds = [...new Set(studentIds.map(String))];

    // One student = one payment. Refuse to put a student into a second active
    // batch (including one that was already paid). Rejected/cancelled batches
    // are ignored by the helper, so corrections can still be re-batched.
    const conflicts = await findBatchConflicts(uniqueIds);
    if (conflicts.length > 0) {
      return res.status(400).json({ message: batchConflictMessage(conflicts) });
    }

    const identity = batchIdentity({ batchName, semester, academicYear, batchMonth });

    // A name may repeat in another month / semester / academic year. Only the
    // exact same identity is a duplicate, and `batchCode` keeps them distinct.
    const duplicate = await Batch.findOne(batchIdentityFilter(identity));
    if (duplicate) {
      return res.status(409).json({
        message: `Batch "${identity.batchName}" already exists for ${identity.batchMonth || 'the same period'} · ${identity.semester} · ${identity.academicYear} (${duplicate.batchCode || 'existing batch'}). Choose a different month or academic year, or edit the existing batch.`,
      });
    }

    const batchCode = await nextBatchCode(Batch, identity);

    // Every student must have a VERIFIED submission before being batched.
    const verified = await Return.find({ student: { $in: uniqueIds }, verified: true })
      .populate('student', 'fullName institutionalId phone');
    if (verified.length !== uniqueIds.length)
      return res.status(400).json({
        message: 'All selected students must be verified before creating a batch',
      });

    // A post-paid update window is not a licence to batch the old record. The
    // student must first resubmit corrected information and be verified again.
    const waitingForResubmission = await User.find({
      _id: { $in: uniqueIds },
      paymentReopenAllowed: true,
      paymentReopenRequestedAt: null,
    }).select('fullName institutionalId').lean();
    if (waitingForResubmission.length > 0) {
      return res.status(400).json({
        message: `Waiting for corrected information from: ${waitingForResubmission
          .map(student => `${student.fullName} (${student.institutionalId})`)
          .join(', ')}.`,
      });
    }

    const { studentById, error: phoneError } = await registeredPhonesFor(uniqueIds);
    if (phoneError) return res.status(400).json({ message: phoneError });

    const batch = await Batch.create({
      batchName: identity.batchName,
      batchMonth: identity.batchMonth,
      batchCode,
      semester,
      academicYear: identity.academicYear,
      createdBy: req.user._id,
      students: uniqueIds,
      status: 'draft',
    });

    // Amount per student = daily rate Ã— internship duration (computed here so
    // approvers can see it; finance recomputes it again at payment time).
    const docs = await Promise.all(uniqueIds.map(async (sid) => {
      const ret = verified.find(r => String(r.student?._id || r.student) === String(sid));
      const { dailyRate, durationDays, amount } = await telebirr.computeAmount(ret);
      return {
        batch: batch._id,
        student: sid,
        return: ret?._id,
        dailyRate,
        durationDays,
        amount,
        // Registered account phone — the only number Finance may pay.
        studentPhone: normalizePhone(studentById.get(String(sid))?.phone),
        status: 'pending_department',
      };
    }));

    await Request.insertMany(docs);

    // The update window is for one replacement payment cycle. Once the new
    // batch exists, lock the record again until CS grants permission anew.
    await User.updateMany(
      { _id: { $in: uniqueIds }, paymentReopenAllowed: true },
      { $set: { paymentReopenAllowed: false } }
    );

    res.status(201).json(batch);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

/* ------------------------------------------------------------------ *
 * Edit a draft batch  ("Edit if Necessary" step of the CS Dept flow)
 * Lets the department rename the batch, change the semester/year and
 * add or remove students BEFORE it is forwarded to the College.
 * The payment requests are rebuilt so one request always matches the
 * current student list â€” the amounts are never left stale.
 * ------------------------------------------------------------------ */
exports.updateBatch = async (req, res) => {
  try {
    const batch = await Batch.findById(req.params.id);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });
    if (batch.status !== 'draft')
      return res.status(400).json({ message: 'Only draft batches can be edited' });

    const { batchName, semester, academicYear, batchMonth, studentIds } = req.body;

    if (!String(batchName || '').trim())
      return res.status(400).json({ message: 'Batch name is required' });
    if (!String(academicYear || '').trim())
      return res.status(400).json({ message: 'Academic year is required' });
    if (!Array.isArray(studentIds) || studentIds.length === 0)
      return res.status(400).json({ message: 'Select at least one student' });

    const uniqueIds = [...new Set(studentIds.map(String))];

    // Students already in ANOTHER active batch stay there. Students currently
    // in this draft are excluded from the conflict check because the request
    // records are rebuilt below.
    const conflicts = await findBatchConflicts(uniqueIds, { excludeBatchId: batch._id });
    if (conflicts.length > 0) {
      return res.status(400).json({ message: batchConflictMessage(conflicts) });
    }

    const identity = batchIdentity({
      batchName,
      semester: semester || batch.semester,
      academicYear,
      batchMonth: batchMonth !== undefined ? batchMonth : batch.batchMonth,
    });

    const duplicate = await Batch.findOne({
      ...batchIdentityFilter(identity),
      _id: { $ne: batch._id },
    });
    if (duplicate) {
      return res.status(409).json({
        message: `Another batch "${identity.batchName}" already exists for ${identity.batchMonth || 'the same period'} · ${identity.semester} · ${identity.academicYear} (${duplicate.batchCode || 'existing batch'}). Choose a different month or academic year.`,
      });
    }

    // Same rule as creation: every student must still be verified and have a
    // registered TeleBirr phone before they can be saved into the batch.
    const verified = await Return.find({ student: { $in: uniqueIds }, verified: true })
      .populate('student', 'fullName institutionalId phone');
    if (verified.length !== uniqueIds.length)
      return res.status(400).json({
        message: 'All selected students must be verified before saving the batch',
      });

    const { studentById, error: phoneError } = await registeredPhonesFor(uniqueIds);
    if (phoneError) return res.status(400).json({ message: phoneError });

    const before = batch.students.map(String).length;

    const identityChanged =
      String(batch.batchName || '') !== identity.batchName ||
      String(batch.semester || '') !== identity.semester ||
      String(batch.academicYear || '') !== identity.academicYear ||
      String(batch.batchMonth || '') !== identity.batchMonth;

    batch.batchName   = identity.batchName;
    batch.batchMonth  = identity.batchMonth;
    batch.semester    = identity.semester;
    batch.academicYear = identity.academicYear;
    // Keep the code stable unless the identity itself changed.
    if (!batch.batchCode || identityChanged) {
      batch.batchCode = await nextBatchCode(Batch, identity);
    }
    batch.students    = uniqueIds;
    batch.history.push({
      actor: req.user._id,
      action: 'edited',
      comment: `Batch edited: ${before} â†’ ${uniqueIds.length} student(s)`,
    });
    await batch.save();

    // Rebuild the payment requests so the list always matches the batch.
    await Request.deleteMany({ batch: batch._id });
    const docs = await Promise.all(uniqueIds.map(async (sid) => {
      const ret = verified.find(r => String(r.student?._id || r.student) === String(sid));
      const { dailyRate, durationDays, amount } = await telebirr.computeAmount(ret);
      return {
        batch: batch._id,
        student: sid,
        return: ret?._id,
        dailyRate,
        durationDays,
        amount,
        studentPhone: normalizePhone(studentById.get(String(sid))?.phone),
        status: 'pending_department',
      };
    }));
    await Request.insertMany(docs);

    await AuditLog.create({
      user: req.user._id,
      action: 'update_batch',
      targetId: batch._id,
      targetType: 'PaymentBatch',
      meta: { studentsBefore: before, studentsAfter: uniqueIds.length },
    });

    res.json(batch);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.forwardBatch = async (req, res) => {
  try {
    const comment = String(req.body?.comment || '').trim();
    if (!comment) {
      return res.status(400).json({
        message: 'A forwarding note is required when advancing a batch',
      });
    }

    // Final guard before the batch leaves the CS Department: never forward a
    // student who is already being paid through another active batch. This
    // protects older drafts that were created before the one-student rule.
    const draft = await Batch.findById(req.params.id).select('students status');
    if (!draft) return res.status(404).json({ message: 'Batch not found' });

    const conflicts = await findBatchConflicts(
      (draft.students || []).map(String),
      { excludeBatchId: draft._id },
    );
    if (conflicts.length > 0) {
      return res.status(400).json({
        message: `Cannot forward this batch — ${batchConflictMessage(conflicts)} Remove the conflicting student(s) by editing the draft first.`,
      });
    }

    const batch = await workflow.advance({
      batchId: req.params.id,
      actor: req.user,
      comment,
    });
    res.json(batch);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.rejectBatch = async (req, res) => {
  try {
    const batch = await workflow.reject({
      batchId: req.params.id,
      actor: req.user,
      comment: req.body?.comment,
    });
    res.json(batch);
  } catch (e) { res.status(400).json({ message: e.message }); }
};

exports.cancelBatch = async (req, res) => {
  const batch = await Batch.findById(req.params.id);
  if (!batch) return res.status(404).json({ message: 'Not found' });
  if (batch.status !== 'draft')
    return res.status(400).json({ message: 'Only draft batches can be cancelled' });

  batch.status = 'rejected';
  batch.rejectionReason = req.body?.comment || 'Cancelled by CS Department';
  batch.history.push({
    actor: req.user._id, action: 'cancelled', comment: batch.rejectionReason,
  });
  await batch.save();

  await Request.updateMany(
    { batch: batch._id },
    { status: 'rejected', rejectionReason: batch.rejectionReason }
  );

  res.json(batch);
};

/* ------------------------------------------------------------------ *
 * Payment Request List
 * One row per student payment request inside a batch.
 * ------------------------------------------------------------------ */
exports.listRequests = async (req, res) => {
  const requests = await Request.find()
    .populate('student', STUDENT_POPULATE)
    .populate('batch', 'batchName batchCode batchMonth semester academicYear status')
    .sort('-createdAt');
  res.json(requests);
};

/* ------------------------------------------------------------------ *
 * History â€” every batch with its full audit trail (history array).
 * ------------------------------------------------------------------ */
exports.listHistory = async (req, res) => {
  const batches = await Batch.find()
    .populate('students', STUDENT_POPULATE)
    .populate('history.actor', 'fullName role')
    .sort('-createdAt');

  // Fix orphaned actor references: if a user was deleted, the populate returns
  // null â€” attach the raw ObjectId so the audit trail never loses the actor.
  const enriched = batches.map(batch => ({
    ...batch.toObject(),
    history: (batch.history || []).map(h => ({
      ...h,
      actor: h.actor && typeof h.actor === 'object' && h.actor._id
        ? h.actor
        : h.actor
          ? { _id: h.actor, fullName: 'Deleted user', role: 'unknown' }
          : h.actor,
    })),
  }));

  res.json(enriched);
};
