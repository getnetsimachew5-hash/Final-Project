const { STUDENT_POPULATE } = require('../utils/studentFields');
const Batch    = require('../models/PaymentBatch');
const Return   = require('../models/InternshipReturn');
const Letter   = require('../models/CompletionLetter');
const Request  = require('../models/PaymentRequest');
const Notification = require('../models/Notification');
const User     = require('../models/User');
const TeleBirrTransaction = require('../models/TeleBirrTransaction');
const workflow = require('../services/workflow.service');
const { deliver, markResolved } = require('../services/message.service');
const { loadStudentDocuments, studentMissingInfo, missingInfoForRequest, fixPageFor } = require('../utils/studentCompleteness');

/**
 * Send a missing-information request to one student and keep the conversation
 * in a single thread. A repeated reminder supersedes the previous open request,
 * so the student always has exactly one item waiting for correction.
 */
async function sendStudentMissingInfoRequest({
  batch,
  request,
  user,
  missing,
  subject,
  message,
  link,
}) {
  const studentId = request.student?._id || request.student;
  if (!studentId) return null;

  const existing = await Notification.findOne({
    student: studentId,
    batch: batch._id,
    category: 'request',
    actionRequired: true,
    resolvedAt: null,
    senderRole: 'college',
  }).sort('-createdAt').select('threadId messageKey');

  if (existing) {
    await markResolved({
      messageKey: existing.messageKey,
      threadId: existing.threadId,
      resolvedBy: user._id,
    });
  }

  const sent = await deliver({
    sender: user,
    recipients: [studentId],
    subject,
    message,
    category: 'request',
    type: 'missing_info',
    link,
    batch: batch._id,
    student: studentId,
    actionRequired: true,
    threadId: existing?.threadId,
    replyTo: existing?.messageKey,
  });

  request.missingInfoRequestedAt = new Date();
  request.missingInfoRequestedBy = user._id;
  request.missingInfoSnapshot = missing;
  await request.save();

  return sent;
}

/**
 * ============================================
 * COLLEGE OFFICE ACTOR CONTROLLER
 * ============================================
 * The College reviews the student information received from the CS
 * Department STUDENT BY STUDENT, then forwards ALL approved students
 * ONCE to the next actor (Academic VP) with a single action.
 */

/**
 * Everything the College Office needs in one call: every batch that reached
 * (or passed) the College, newest first, with its per-student payment
 * requests ordered by student name, plus who forwarded it from CS Dept.
 *
 * Two bugs used to make this endpoint return HTTP 500, which left the whole
 * College dashboard EMPTY ("No pending requests from CS Department"):
 *   1. 'batch' was missing from .select(), so requests had no key to group
 *      by and every batch came back with an empty student list.
 *   2. A payment request pointing at a DELETED student account made
 *      `r.student._id` throw a TypeError. Students are now normalised.
 */
exports.list = async (req, res) => {
  try {
    const batches = await Batch.find()
      .populate('students', STUDENT_POPULATE)
      .populate('createdBy', 'fullName role')
      .populate({ path: 'history.actor', select: 'fullName role' })
      .sort('-createdAt');

    const batchIds = batches.map(b => b._id);

    // Full per-student decisions so the College UI can review ONE student
    // at a time (individual approve / reject). 'batch' MUST be selected —
    // it is the grouping key used below.
    const allRequests = await Request.find({ batch: { $in: batchIds } })
      .populate('student', STUDENT_POPULATE)
      .select('batch student status amount rejectionReason collegeApprovalComment createdAt missingInfoRequestedAt missingInfoSnapshot return');

    const studentIds = [...new Set(allRequests.map(r => {
      const s = r.student;
      if (s && typeof s === 'object') return s._id;
      return s;
    }).filter(Boolean))];

    const docs = await loadStudentDocuments(studentIds);

    const requestsByBatch = {};
    for (const r of allRequests) {
      const key = String(r.batch?._id || r.batch);
      if (!key || key === 'undefined') continue;

      const studentObj = r.student && typeof r.student === 'object' ? r.student.toObject() : r.student;
      const normalized = studentObj ? safeStudentFull(studentObj) : safeStudent(r.student);
      // Also keep a version that looks like the original populate shape for completeness checks
      const completenessStudent = (r.student && typeof r.student === 'object') ? r.student : normalized;
      const missingInfo = missingInfoForRequest({ student: completenessStudent }, docs);

      (requestsByBatch[key] = requestsByBatch[key] || []).push({
        _id: r._id,
        student: normalized,
        status: r.status,
        amount: r.amount,
        rejectionReason: r.rejectionReason || null,
        collegeApprovalComment: r.collegeApprovalComment || null,
        createdAt: r.createdAt,
        missingInfo,
        missingInfoRequestedAt: r.missingInfoRequestedAt || null,
        missingInfoSnapshot: Array.isArray(r.missingInfoSnapshot) ? r.missingInfoSnapshot : [],
      });
    }
    // "Order by order" inside each batch: alphabetical by student name.
    Object.values(requestsByBatch).forEach(list =>
      list.sort((a, b) =>
        String(a.student.fullName).localeCompare(String(b.student.fullName))));

    const counts = await Request.aggregate([
      { $match: { batch: { $in: batchIds } } },
      { $group: {
        _id: '$batch',
        total:       { $sum: 1 },
        approved:    { $sum: { $cond: [{ $eq: ['$status', 'college_approved'] }, 1, 0] } },
        forwarded:   { $sum: { $cond: [{ $eq: ['$status', 'pending_academic_vp'] }, 1, 0] } },
        rejected:    { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
        paidCount:   { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
        totalAmount: { $sum: '$amount' },
      } },
    ]);
    const countsById = Object.fromEntries(counts.map(c => [String(c._id), c]));

    res.json(batches.map(b => {
      const c = countsById[String(b._id)] || {
        total: (b.students || []).length, approved: 0, forwarded: 0,
        rejected: 0, paidCount: 0, totalAmount: 0,
      };
      const reqs = requestsByBatch[String(b._id)] || [];
      return {
        ...b.toObject(),
        requests: reqs,
        studentDecisions: {
          total: c.total, approved: c.approved, forwarded: c.forwarded,
          rejected: c.rejected, paid: c.paidCount, totalAmount: c.totalAmount,
        },
        missingInfoCount: reqs.filter(r => (r.missingInfo || []).length > 0 && r.status === 'pending_college').length,
        // "Received from the CS Department" — the forward entry.
        forwardedBy: firstForwardedBy(b),
      };
    }));
  } catch (error) {
    console.error('College batches error:', error);
    res.status(500).json({ message: 'Failed to load batches', detail: error.message });
  }
};

// Documents (return forms + completion letters) for every student in a batch.
exports.documents = async (req, res) => {
  try {
    const batch = await Batch.findById(req.params.id)
      .populate('students', STUDENT_POPULATE);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    const studentIds = (batch.students || []).map(s => s._id).filter(Boolean);
    const returns = await Return.find({ student: { $in: studentIds } })
      .populate('student', STUDENT_POPULATE);
    const letters = await Letter.find({ return: { $in: returns.map(r => r._id) } });
    const letterByStudent = {};
    for (const l of letters) {
      if (l.student) letterByStudent[String(l.student)] = l;
    }

    res.json({
      batch: {
        _id: batch._id, batchName: batch.batchName, status: batch.status,
        semester: batch.semester, academicYear: batch.academicYear,
      },
      students: (batch.students || []).map(s => {
        const ret = returns.find(r => String(r.student?._id) === String(s._id));
        const letter = letterByStudent[String(s._id)];
        return {
          student: {
            _id: s._id,
            fullName: s.fullName || 'Unknown student (account removed)',
            institutionalId: s.institutionalId || 'â€”',
          },
          returnForm: ret ? { orgName: ret.orgName, orgAddress: ret.orgAddress,
                              supervisorName: ret.supervisorName,
                              startDate: ret.startDate, endDate: ret.endDate,
                              status: ret.status } : null,
          // Stored relative path (e.g. "uploads/letters/x.pdf"); the frontend
          // turns it into a full URL with the shared fileUrl() helper.
          letterUrl: letter ? letter.filePath : null,
          letterVerified: letter ? Boolean(letter.isVerified) : false,
        };
      }),
    });
  } catch (error) {
    console.error('College documents error:', error);
    res.status(500).json({ message: 'Failed to load documents', detail: error.message });
  }
};

// ============================================
// PER-STUDENT APPROVE / REJECT
// ============================================

/**
 * Identify missing information for a specific student, notify them
 * AUTOMATICALLY with the exact list, and record the request.
 */
exports.requestMissingInfo = async (req, res) => {
  try {
    const { id, studentId } = req.params;
    const custom = String(req.body?.message || '').trim();

    const batch = await Batch.findById(id);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });
    if (batch.status !== 'pending_college')
      return res.status(400).json({ message: `Batch is ${batch.status}. Missing-information requests can only be made while pending_college.` });

    const request = await Request.findOne({ batch: id, student: studentId })
      .populate('student', STUDENT_POPULATE);
    if (!request) return res.status(404).json({ message: 'Student not found in this batch' });
    if (!request.student) return res.status(400).json({ message: 'This payment request points to a student account that no longer exists.' });

    const docs = await loadStudentDocuments([request.student._id]);
    const missing = missingInfoForRequest({ student: request.student }, docs);

    if (missing.length === 0) {
      return res.status(400).json({ message: 'All required information is already complete for this student — you can approve them now.' });
    }

    const page = fixPageFor(missing);
    const note = custom ? `\n\nCollege note: ${custom}` : '';
    const message = `📝 Missing information identified by the College Office.\n\nBatch: ${batch.batchName}\n\nMissing: ${missing.join(', ')}.\n\nPlease open ${page === '/student/profile' ? 'My Information (Student Dashboard / Update Profile)' : page === '/student/return' ? 'the Internship Return Form' : 'the Completion Letter Upload'} page to fill/correct the missing details and resubmit so the College can review your request.${note}`;

    await sendStudentMissingInfoRequest({
      batch,
      request,
      user: req.user,
      missing,
      subject: `Correction needed for batch ${batch.batchName}`,
      message,
      link: page,
    });

    batch.history.push({
      actor: req.user._id,
      action: 'missing_info_requested',
      comment: `Missing: ${missing.join(' | ')}`,
      meta: { student: studentId, missingInfo: missing.join(' | ') },
      at: new Date(),
    });
    await batch.save();

    await AuditLogHelper(req, 'request_missing_info_college', request._id, { student: String(studentId), missingInfo: missing });

    res.json({
      message: `Notification sent automatically to ${request.student.fullName} with the exact missing information.`,
      missingInfo: missing,
      notified: true,
    });
  } catch (error) {
    console.error('requestMissingInfo error:', error);
    res.status(500).json({ message: 'Failed to request missing information', detail: error.message });
  }
};

/**
 * Batch-level request to the CS Department.
 *
 * The College can ask the CS Department to correct the information for every
 * student in the batch (or just the ones that are currently incomplete). The
 * message is threaded and stays open until the CS Department replies.
 */
exports.requestCsCorrection = async (req, res) => {
  try {
    const { id } = req.params;
    const custom = String(req.body?.message || '').trim();

    const batch = await Batch.findById(id);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });
    if (batch.status !== 'pending_college') {
      return res.status(400).json({
        message: `Batch is ${batch.status}. You can ask the CS Department for corrections while it is pending at the College.`,
      });
    }

    const requests = await Request.find({ batch: batch._id })
      .populate('student', STUDENT_POPULATE);
    const studentIds = requests.map(r => r.student?._id || r.student).filter(Boolean);
    const docs = await loadStudentDocuments(studentIds);

    const missingByStudent = [];
    for (const request of requests) {
      if (!request.student) continue;
      const missing = missingInfoForRequest({ student: request.student }, docs);
      if (missing.length > 0) {
        missingByStudent.push({ student: request.student, missing });
        request.missingInfoRequestedAt = new Date();
        request.missingInfoRequestedBy = req.user._id;
        request.missingInfoSnapshot = missing;
        await request.save();
      }
    }

    const studentLines = requests
      .filter(r => r.student)
      .map(r => `• ${r.student.fullName} (${r.student.institutionalId})`)
      .join('\n');
    const missingLines = missingByStudent
      .map(({ student, missing }) =>
        `• ${student.fullName} (${student.institutionalId}): ${missing.join(', ')}`)
      .join('\n');

    const message = [
      `The College Office is reviewing batch "${batch.batchName}" and needs corrected or verified student information.`,
      missingByStudent.length > 0
        ? `Missing or incorrect information:\n${missingLines}`
        : `Please verify that all information is complete for:\n${studentLines}`,
      custom ? `College note: ${custom}` : '',
      'After correcting the information, resubmit or forward the batch so the College can complete the review.',
    ].filter(Boolean).join('\n\n');

    const csUsers = await User.find({ role: 'cs_dept', accountStatus: 'active' });
    if (csUsers.length === 0) {
      return res.status(400).json({ message: 'There are no active CS Department users to notify.' });
    }

    const sent = await deliver({
      sender: req.user,
      recipients: csUsers,
      subject: `Correct information needed for batch ${batch.batchName}`,
      message,
      category: 'request',
      type: 'missing_info',
      link: '/cs-dept/submissions',
      batch: batch._id,
      actionRequired: true,
    });

    batch.history.push({
      actor: req.user._id,
      action: 'cs_correction_requested',
      comment: custom || `Requested corrected information for ${missingByStudent.length || requests.length} student(s)`,
      meta: {
        students: String(requests.length),
        missingStudents: String(missingByStudent.length),
      },
      at: new Date(),
    });
    await batch.save();

    await AuditLogHelper(req, 'request_cs_correction_college', batch._id, {
      missingStudents: missingByStudent.length,
      students: requests.length,
    });

    res.json({
      message: `Message sent to the CS Department${missingByStudent.length ? ` with ${missingByStudent.length} student(s) needing correction` : ''}.`,
      notified: sent.inserted,
      missingStudents: missingByStudent.map(({ student, missing }) => ({
        studentId: student._id,
        fullName: student.fullName,
        missing,
      })),
    });
  } catch (error) {
    console.error('requestCsCorrection error:', error);
    res.status(500).json({ message: 'Failed to message the CS Department', detail: error.message });
  }
};

/**
 * Approve ONE student after looking at their information.
 * Marks only that student's payment request 'college_approved'.
 * The batch stays at the College until they forward the approved students.
 */
exports.approveStudent = async (req, res) => {
  try {
    const { comment } = req.body;
    const { id, studentId } = req.params;
    if (!comment || !comment.trim()) {
      return res.status(400).json({ message: 'Approval comment is required' });
    }

    const batch = await Batch.findById(id);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });
    if (batch.status !== 'pending_college')
      return res.status(400).json({ message: `Batch is ${batch.status}. Students can only be approved while pending_college.` });

    const request = await Request.findOne({ batch: id, student: studentId }).populate('student', STUDENT_POPULATE);
    if (!request) return res.status(404).json({ message: 'Student not found in this batch' });
    if (!request.student) return res.status(400).json({ message: 'This payment request points to a student account that no longer exists.' });

    // Block approval if information is missing. Notify the student automatically.
    const docs = await loadStudentDocuments([request.student._id]);
    const missing = missingInfoForRequest({ student: request.student }, docs);
    if (missing.length > 0) {
      const page = fixPageFor(missing);
      const message = `📝 The College Office cannot approve your request yet — missing information.\n\nBatch: ${batch.batchName}\n\nMissing: ${missing.join(', ')}.\n\nPlease update your details on the Student Portal (${page}) and resubmit/correct them. A notification has been sent automatically with this checklist.`;

      // Notify automatically. Repeated attempts stay in the same conversation.
      try {
        await sendStudentMissingInfoRequest({
          batch,
          request,
          user: req.user,
          missing,
          subject: `Correction needed for batch ${batch.batchName}`,
          message,
          link: page,
        });
      } catch (e) { /* ignore notification failure */ }

      batch.history.push({
        actor: req.user._id,
        action: 'missing_info_requested',
        comment: `Blocked approval — missing: ${missing.join(' | ')}`,
        meta: { student: studentId, missingInfo: missing.join(' | ') },
        at: new Date(),
      });
      await batch.save();

      return res.status(400).json({
        message: `Cannot approve — missing information: ${missing.join(', ')}. A notification was sent automatically to the student with the exact list and instructions to fill it.`,
        missingInfo: missing,
        notified: true,
      });
    }

    request.status = 'college_approved';
    request.collegeApprovalComment = comment.trim();
    await request.save();

    batch.history.push({
      actor: req.user._id,
      action: 'student_approved',
      comment: comment.trim(),
      meta: { student: studentId },
      at: new Date(),
    });
    await batch.save();

    await AuditLogHelper(req, 'approve_student_college', request._id, metaFor(studentId, comment));

    res.json({ message: 'Student approved at College. Approve others or forward all approved students to the Academic VP.', request });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to approve student', detail: error.message });
  }
};

/**
 * Reject ONE student (they are NOT forwarded; CS Dept / student informed).
 */
exports.rejectStudent = async (req, res) => {
  try {
    const { comment } = req.body;
    const { id, studentId } = req.params;
    if (!comment || !comment.trim()) {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    const batch = await Batch.findById(id);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });
    if (batch.status !== 'pending_college')
      return res.status(400).json({ message: `Batch is ${batch.status}. Students can only be rejected while pending_college.` });

    const request = await Request.findOne({ batch: id, student: studentId });
    if (!request) return res.status(404).json({ message: 'Student not found in this batch' });

    request.status = 'rejected';
    request.rejectionReason = comment.trim();
    await request.save();

    batch.history.push({
      actor: req.user._id,
      action: 'student_rejected',
      comment: comment.trim(),
      meta: { student: studentId },
      at: new Date(),
    });
    await batch.save();

    const studentUser = await User.findById(studentId);
    if (studentUser) {
      await deliver({
        sender: req.user,
        recipients: [studentUser._id],
        subject: `Payment request rejected by the College Office`,
        message: `Your internship payment request was REJECTED by the College Office.\n\nReason: ${comment.trim()}\n\nContact the CS Department if you need to correct your information and be included in a new batch.`,
        category: 'notification',
        type: 'status',
        link: '/student/status',
        batch: batch._id,
        student: studentUser._id,
      });
    }

    await AuditLogHelper(req, 'reject_student_college', request._id, metaFor(studentId, comment));

    res.json({ message: 'Student rejected. They were NOT included in the forwarded group.', request });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to reject student', detail: error.message });
  }
};

/**
 * Approve ALL not-yet-decided students in one batch at once
 * (convenience for fast accessibility â€” still one audit entry per student).
 */
exports.approveAllStudents = async (req, res) => {
  try {
    const { comment } = req.body;
    const { id } = req.params;
    if (!comment || !comment.trim()) {
      return res.status(400).json({ message: 'Approval comment is required' });
    }

    const batch = await Batch.findById(id);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });
    if (batch.status !== 'pending_college')
      return res.status(400).json({ message: `Batch is ${batch.status}. Can only approve while pending_college.` });

    const undecided = await Request.find({ batch: id, status: 'pending_college' })
      .populate('student', STUDENT_POPULATE);

    if (undecided.length === 0) {
      return res.json({
        message: 'Every student already has a decision — nothing left to approve.',
        count: 0,
        approved: [],
        skipped: [],
        skippedCount: 0,
      });
    }

    const studentIds = undecided
      .map(request => request.student?._id || request.student)
      .filter(Boolean);
    const documents = await loadStudentDocuments(studentIds);

    const approved = [];
    const skipped = [];

    // Bulk approval must never approve incomplete information. Students who
    // are not ready are skipped, notified automatically with the exact
    // checklist, and reported back to the College officer.
    for (const request of undecided) {
      const studentId = request.student?._id || request.student;

      if (!request.student) {
        skipped.push({
          studentId: String(studentId || ''),
          fullName: 'Unknown student (account removed)',
          missingInfo: ['Student account (account was removed)'],
        });
        continue;
      }

      const missing = missingInfoForRequest({ student: request.student }, documents);
      if (missing.length > 0) {
        const page = fixPageFor(missing);
        try {
          await sendStudentMissingInfoRequest({
            batch,
            request,
            user: req.user,
            missing,
            subject: `Correction needed for batch ${batch.batchName}`,
            message: `The College Office could not approve your request yet — missing information.\n\nBatch: ${batch.batchName}\n\nMissing: ${missing.join(', ')}.\n\nPlease update your details on the Student Portal (${page}) and resubmit so the College can complete the review.`,
            link: page,
          });
        } catch (e) { /* notification failure must not stop the bulk action */ }

        skipped.push({
          studentId: String(request.student._id),
          fullName: request.student.fullName || request.student.institutionalId || 'Unknown student',
          missingInfo: missing,
        });
        continue;
      }

      request.status = 'college_approved';
      request.collegeApprovalComment = comment.trim();
      await request.save();

      batch.history.push({
        actor: req.user._id,
        action: 'student_approved',
        comment: comment.trim(),
        meta: { student: request.student._id, bulk: 'true' },
        at: new Date(),
      });
      approved.push({
        studentId: String(request.student._id),
        fullName: request.student.fullName || request.student.institutionalId || 'Unknown student',
      });
    }

    if (skipped.length > 0) {
      batch.history.push({
        actor: req.user._id,
        action: 'bulk_approval_skipped_missing_info',
        comment: `Bulk approval skipped ${skipped.length} student(s) with incomplete information — they were notified automatically.`,
        meta: { skipped: skipped.map(s => s.fullName).join(', ') },
        at: new Date(),
      });
    }

    await batch.save();

    await AuditLogHelper(req, 'approve_all_students_college', batch._id, {
      ...metaFor(batch._id, `${approved.length} approved, ${skipped.length} skipped`),
      approved: String(approved.length),
      skipped: String(skipped.length),
    });

    res.json({
      message: `${approved.length} student(s) approved${skipped.length ? `; ${skipped.length} skipped because information is still missing (they were notified automatically)` : ''}. Now forward the approved students to the Academic VP.`,
      count: approved.length,
      approved,
      skipped,
      skippedCount: skipped.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to approve all students', detail: error.message });
  }
};

/**
 * FORWARD APPROVED STUDENTS ONCE to the Academic VP.
 * Only students with request status 'college_approved' move forward â€”
 * this is the single fast action ("fast accessibility") the College uses
 * instead of approving per student again.
 */
exports.forwardApproved = async (req, res) => {
  try {
    const { comment } = req.body;
    const note = (comment && comment.trim())
      || 'Approved students forwarded to Academic VP after individual review';

    const batch = await Batch.findById(req.params.id);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });
    if (batch.status !== 'pending_college')
      return res.status(400).json({ message: `Batch is ${batch.status}. Can only forward from pending_college.` });

    const approved = await Request.find({ batch: batch._id, status: 'college_approved' }).countDocuments();
    if (approved === 0) {
      return res.status(400).json({ message: 'No students approved yet. Approve students before forwarding.' });
    }

    // Every student must have a decision first. Otherwise the undecided ones
    // stay at 'pending_college' inside a batch that has already moved on â€”
    // no office can ever act on them again.
    const undecidedDocs = await Request.find({ batch: batch._id, status: 'pending_college' })
      .populate('student', STUDENT_POPULATE);
    if (undecidedDocs.length > 0) {
      const studentIds = undecidedDocs.map(u => u.student?._id || u.student).filter(Boolean);
      const docs = await loadStudentDocuments(studentIds);
      const missingList = [];
      for (const reqDoc of undecidedDocs) {
        if (!reqDoc.student) { missingList.push('a student account removed'); continue; }
        const missing = missingInfoForRequest({ student: reqDoc.student }, docs);
        if (missing.length > 0) {
          missingList.push(reqDoc.student.fullName);
          const page = fixPageFor(missing);
          try {
            await sendStudentMissingInfoRequest({
              batch,
              request: reqDoc,
              user: req.user,
              missing,
              subject: `Correction needed before batch ${batch.batchName} can be forwarded`,
              message: `The College Office cannot forward your batch yet — missing information.\n\nBatch: ${batch.batchName}\n\nMissing: ${missing.join(', ')}.\n\nPlease update your details on the Student Portal (${page}) so the College can complete your review and forward you to the next office.`,
              link: page,
            });
          } catch (e) { /* ignore */ }
        }
      }
      batch.history.push({
        actor: req.user._id,
        action: 'forward_blocked_missing_info',
        comment: missingList.length > 0 ? `Blocked — missing info: ${missingList.join(', ')}` : 'Blocked — undecided students remain',
        meta: { undecided: String(undecidedDocs.length) },
        at: new Date(),
      });
      await batch.save();

      if (missingList.length > 0) {
        return res.status(400).json({
          message: `${undecidedDocs.length} student(s) still need decisions. Students with missing information were notified automatically: ${missingList.join(', ')}. Approve or reject every student first, then forward.`,
        });
      }
      return res.status(400).json({
        message: `${undecidedDocs.length} student(s) still have no decision. Approve or reject every student first, then forward — the Academic VP must receive complete information.`,
      });
    }

    // Safety check: no approved student may have missing info
    const approvedReqs = await Request.find({ batch: batch._id, status: 'college_approved' })
      .populate('student', STUDENT_POPULATE);
    const approvedIds = approvedReqs.map(u => u.student?._id || u.student).filter(Boolean);
    const docsApproved = await loadStudentDocuments(approvedIds);
    const missingApproved = [];
    for (const reqDoc of approvedReqs) {
      if (!reqDoc.student) { missingApproved.push('a student account removed'); continue; }
      const missing = missingInfoForRequest({ student: reqDoc.student }, docsApproved);
      if (missing.length > 0) {
        missingApproved.push(reqDoc.student.fullName);
        const page = fixPageFor(missing);
        try {
          await sendStudentMissingInfoRequest({
            batch,
            request: reqDoc,
            user: req.user,
            missing,
            subject: `Correction needed before batch ${batch.batchName} can be forwarded`,
            message: `The College Office cannot forward your approved request yet — information must be complete.\n\nBatch: ${batch.batchName}\n\nMissing: ${missing.join(', ')}.\n\nPlease update your details on the Student Portal (${page}) before forwarding continues.`,
            link: page,
          });
        } catch (e) { /* ignore */ }
      }
    }
    if (missingApproved.length > 0) {
      batch.history.push({
        actor: req.user._id,
        action: 'forward_blocked_missing_info',
        comment: `Blocked forwarding — approved students still missing info: ${missingApproved.join(', ')}`,
        meta: { students: missingApproved.join(', ') },
        at: new Date(),
      });
      await batch.save();
      return res.status(400).json({
        message: `Cannot forward — ${missingApproved.length} approved student(s) have missing information and were notified automatically. Complete all information before forwarding.`,
      });
    }

    batch.status = 'pending_academic_vp';
    batch.history.push({
      actor: req.user._id,
      action: 'forwarded_to_academic_vp',
      comment: note,
      meta: { approvedStudents: String(approved) },
      at: new Date(),
    });
    await batch.save();

    await Request.updateMany(
      { batch: batch._id, status: 'college_approved' },
      { status: 'pending_academic_vp' },
    );

    // Notify Academic VP office
    const avpUsers = await User.find({ role: 'academic_vp', accountStatus: 'active' });
    if (avpUsers.length > 0) {
      await deliver({
        sender: req.user,
        recipients: avpUsers,
        subject: `Batch ${batch.batchName} forwarded for academic review`,
        message: `Batch "${batch.batchName}" — ${approved} student(s) forwarded by the College Office.\n\nBatch: ${batch.batchName}\nStudents: ${approved}`,
        category: 'workflow',
        type: 'workflow',
        link: '/academic-vp/approved',
        batch: batch._id,
      });
    }

    await AuditLogHelper(req, 'forward_approved_students', batch._id, metaFor(batch._id, note));

    res.json({
      message: `${approved} approved student(s) forwarded to the Academic VP.`,
      approvedCount: approved,
      batch,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to forward approved students', detail: error.message });
  }
};

// ============================================
// LEGACY / WHOLE-BATCH ACTIONS (batch level, unchanged behaviour)
// ============================================

exports.approve = async (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment || !comment.trim()) {
      return res.status(400).json({ message: 'Approval comment is required' });
    }
    const result = await workflow.collegeApproveBatch({
      userId: req.user._id,
      batchId: req.params.id,
      comment: comment.trim(),
    });
    res.json({
      message: 'Batch approved. Forwarded to Academic VP.',
      batch: result,
    });
  } catch (e) { res.status(400).json({ message: e.message }); }
};

exports.reject = async (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment || !comment.trim()) {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }
    const result = await workflow.collegeRejectBatch({
      userId: req.user._id,
      batchId: req.params.id,
      comment: comment.trim(),
    });
    res.json({
      message: 'Batch rejected. Sent back to CS Department.',
      batch: result,
    });
  } catch (e) { res.status(400).json({ message: e.message }); }
};

// ============================================
// TELEBIRR PAYMENT VIEW
// ============================================

/**
 * College can see, AFTER Finance pays, each student's TeleBirr payment:
 * amount, registered phone, transaction reference and date.
 */
exports.payments = async (req, res) => {
  const txs = await TeleBirrTransaction.find()
    .populate({
      path: 'request',
      select: 'amount status batch studentPhone dailyRate durationDays',
      populate: { path: 'batch', select: 'batchName semester academicYear status' },
    })
    .populate('student', STUDENT_POPULATE)
    .sort('-createdAt');

  res.json({
    payments: txs,
    paidCount: txs.filter(t => t.status === 'confirmed').length,
    totalPaid: txs.filter(t => t.status === 'confirmed').reduce((s, t) => s + t.amount, 0),
  });
};

// ============================================
// Small helpers
// ============================================

/**
 * A payment request can point at a student account that has since been
 * deleted (demo data). Never let that crash a list of requests — send the
 * browser a usable placeholder instead.
 */
function safeStudent(s) {
  return {
    _id: s?._id || null,
    fullName: s?.fullName || 'Unknown student (account removed)',
    institutionalId: s?.institutionalId || '—',
  };
}

function safeStudentFull(s) {
  return {
    _id: s?._id || null,
    fullName: s?.fullName || 'Unknown student (account removed)',
    institutionalId: s?.institutionalId || '—',
    email: s?.email || '',
    phone: s?.phone || '',
    program: s?.program || '',
    year: s?.year ?? null,
    semester: s?.semester || '',
    username: s?.username || '',
    department: s?.department || '',
    accountStatus: s?.accountStatus || '',
  };
}

/**
 * The CS Department's "I forwarded this batch to the College" entry, so the
 * College can always see WHERE a request came from, who sent it and when.
 */
function firstForwardedBy(b) {
  const byDate = (b.history || [])
    .slice()
    .sort((a, z) => new Date(a.at || 0) - new Date(z.at || 0));

  // Best case: an explicit forward entry written by workflow.service.js.
  const explicit = byDate.filter(x => x.action === 'forwarded_to_college').pop();

  // Fallback for older batches: the FIRST approval of the chain â€” that is the
  // CS Department handing the batch over to this office (later 'approved'
  // entries belong to the College and the actors after it).
  const legacy = byDate.find(x => x.action === 'approved' && x.actor);

  const h = explicit || legacy;
  if (!h) return null;

  return {
    at: h.at || null,
    comment: h.comment || '',
    name: h.actor?.fullName || 'CS Department',
    role: h.actor?.role || 'cs_dept',
  };
}

async function AuditLogHelper(req, action, targetId, meta) {
  const AuditLog = require('../models/AuditLog');
  await AuditLog.create({
    user: req.user._id,
    action,
    targetId,
    targetType: 'PaymentRequest',
    meta,
  });
}

function metaFor(studentId, comment) {
  return { student: String(studentId), comment: String(comment || '') };
}
