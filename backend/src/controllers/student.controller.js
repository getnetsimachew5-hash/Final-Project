const path         = require('path');
const Return       = require('../models/InternshipReturn');
const Letter       = require('../models/CompletionLetter');
const Notification = require('../models/Notification');
const User         = require('../models/User');
const AuditLog     = require('../models/AuditLog');
const PaymentRequest = require('../models/PaymentRequest');
const upload       = require('../middleware/upload');
const { validateReturnInput } = require('../utils/returnValidation');
const { normalizePhone } = require('../utils/paymentPhone');
const { deliver, markResolved } = require('../services/message.service');
const {
  loadStudentDocuments,
  studentProfileMissingInfo,
  studentMissingInfo,
  fixPageFor,
} = require('../utils/studentCompleteness');

/**
 * Tell the offices that asked for a correction that the student has supplied
 * it. If the office's request is still open, the answer is added to the same
 * conversation and the request is marked resolved. The CS Department is
 * always told because it owns the student record; the College is told only
 * when it actually asked for something.
 */
async function notifyCorrectedInformation({ student, summary, kind, resubmitted = false }) {
  for (const role of ['cs_dept', 'college']) {
    const open = await Notification.findOne({
      student: student._id,
      category: 'request',
      actionRequired: true,
      resolvedAt: null,
      senderRole: role,
    }).sort('-createdAt');

    if (role === 'college' && !open) continue;

    const users = await User.find({ role, accountStatus: 'active' });
    if (users.length === 0) continue;

    let subject;
    if (role !== 'cs_dept') {
      subject = 'Student supplied the information requested by the College';
    } else if (kind === 'profile') {
      subject = 'Student corrected personal information';
    } else if (resubmitted || open) {
      subject = 'Corrected internship information submitted';
    } else {
      subject = 'New internship information submitted';
    }

    await deliver({
      sender: student,
      recipients: users,
      subject,
      message: summary,
      category: 'resubmission',
      type: 'submission',
      link: role === 'cs_dept' ? '/cs-dept/submissions' : '/college/pending',
      student: student._id,
      threadId: open?.threadId,
      replyTo: open?.messageKey,
    });

    if (open) {
      await markResolved({ messageKey: open.messageKey, resolvedBy: student._id });
    }
  }
}

/**
 * ============================================
 * STUDENT ACTOR CONTROLLER
 * ============================================
 * Functions:
 * - Submit / Resubmit internship return form
 * - Upload / Re-upload completion letter
 * - View submission & payment status
 * - Receive notifications
 * - View payment history
 * - Identity verification
 */

// ============================================
// STUDENT SUBMISSION (with RESUBMIT support)
// ============================================

/**
 * Submit or RESUBMIT internship return form
 * - First time → create new
 * - If previously rejected by CS → allow update + clear old letter
 */
exports.submitReturn = async (req, res) => {
  try {
    /* ---------- Gate 1: field validation ---------- */
    const { ok, errors, values } = validateReturnInput(req.body || {});

    if (!ok) {
      return res.status(400).json({
        message: errors[0].message,
        field: errors[0].field,
        errors,
      });
    }

    /* ---------- Gate 2: the student's own record must be complete -------
       Payments are sent to the registered TeleBirr phone and the College
       Office cannot approve a request without email/program/year, so the
       form is refused here with the exact list of missing items instead of
       letting the problem surface later in the CS Department batch screen. */
    const profileMissing = studentProfileMissingInfo(req.user);
    if (profileMissing.length > 0) {
      return res.status(400).json({
        message: 'Please complete your personal information before submitting the internship form.',
        missingInfo: profileMissing,
        fixPage: '/student/profile',
      });
    }

    const { orgName, orgAddress, supervisorName, supervisorPhone, startDate, endDate } = values;

    const existing = await Return.findOne({ student: req.user._id });
    const paidRequest = await PaymentRequest.findOne({
      student: req.user._id,
      status: 'paid',
      reopenedAt: null,
    }).select('_id');
    const reopenAllowed = Boolean(req.user.paymentReopenAllowed);

    // Information is locked after payment unless the CS Department opened a
    // controlled update window for this student. Otherwise the normal rules
    // apply: verified or in-pipeline submissions cannot be edited.
    if (existing) {
      if (paidRequest && !reopenAllowed) {
        return res.status(409).json({
          message: 'Your payment has already been completed, so your information is locked. Contact the CS Department if a correction is needed.',
          locked: true,
          existingStatus: existing.status,
        });
      }
      if (existing.verified === true && existing.status !== 'rejected' && !reopenAllowed) {
        return res.status(409).json({
          message: 'Your submission is already verified by CS Department. You cannot change it.',
          existingStatus: existing.status
        });
      }
      if (existing.status !== 'rejected' && existing.status !== 'submitted' && !reopenAllowed) {
        return res.status(409).json({
          message: 'Your submission is already in the approval process. Contact CS Department if you need changes.',
          existingStatus: existing.status
        });
      }
    }

    const data = {
      orgName,
      orgAddress,
      supervisorName,
      supervisorPhone,
      startDate,
      endDate,
      status: 'submitted',
      rejectionReason: undefined,
      verified: false,
      verifiedAt: null,
      verifiedBy: null,
    };

    let internshipReturn;
    let isResubmit = false;

    if (existing && (existing.status === 'rejected' || existing.verified || paidRequest || reopenAllowed)) {
      // ========== RESUBMIT / CONTROLLED POST-PAID UPDATE ==========
      Object.assign(existing, data);
      internshipReturn = await existing.save();
      isResubmit = true;

      // Delete old completion letter so student must upload a new one
      await Letter.deleteMany({ return: existing._id });

      if (reopenAllowed) {
        req.user.paymentReopenRequestedAt = new Date();
        await req.user.save();
      }

      await Notification.create({
        recipient: req.user._id,
        message: '✅ You have successfully resubmitted your internship return form. Waiting for CS Department review.',
        type: 'info',
      });
    } else if (existing && existing.status === 'submitted') {
      // Allow update while still only submitted (not yet verified)
      Object.assign(existing, data);
      internshipReturn = await existing.save();
    } else {
      // ========== FIRST TIME SUBMIT ==========
      internshipReturn = await Return.create({
        student: req.user._id,
        ...data,
      });
    }

    // Audit log
    await AuditLog.create({
      user: req.user._id,
      action: isResubmit ? 'resubmit_return' : 'submit_return',
      targetId: internshipReturn._id,
      targetType: 'InternshipReturn',
      meta: {
        orgName: internshipReturn.orgName,
        supervisorName: internshipReturn.supervisorName,
      },
    });

    // Notify the CS Department (and the College, if it had asked for a
    // correction). A resubmission is threaded onto the original request so
    // the conversation is easy to follow.
    await notifyCorrectedInformation({
      student: req.user,
      kind: 'return',
      resubmitted: Boolean(isResubmit),
      summary: isResubmit
        ? `Student ${req.user.fullName} (${req.user.institutionalId}) has RESUBMITTED corrected internship information. Please review the updated record and continue the workflow.`
        : `New internship submission from ${req.user.fullName} (${req.user.institutionalId}). Organization: ${orgName}. Ready for verification.`,
    });

    res.status(201).json({
      message: isResubmit
        ? 'Resubmitted successfully. Waiting for CS Department verification.'
        : 'Internship return submitted successfully. Awaiting CS Department verification.',
      return: internshipReturn,
      nextStep: 'Upload completion letter (if not already done) and wait for CS Department verification'
    });
  } catch (error) {
    console.error('Submit return error:', error);
    res.status(500).json({ message: 'Failed to submit return. Please try again.' });
  }
};

// ============================================
// STATUS & HISTORY
// ============================================

const JOURNEY_STAGES = [
  { key: 'submitted', label: 'Submitted', desc: 'Your return form and completion letter were received.' },
  { key: 'cs', label: 'CS Department', desc: 'Documents verified and your payment batch prepared.' },
  { key: 'college', label: 'College Office', desc: 'Student documents reviewed and approved.' },
  { key: 'academic_vp', label: 'Academic VP', desc: 'Academic eligibility endorsed.' },
  { key: 'admin_vp', label: 'Administrative VP', desc: 'Payment availability authorized.' },
  { key: 'finance', label: 'Finance Office', desc: 'TeleBirr payment processed.' },
  { key: 'paid', label: 'Paid', desc: 'Money sent to your registered TeleBirr account.' },
];

function stageFromRequestStatus(status) {
  switch (status) {
    case 'pending_department': return 'cs';
    case 'pending_college': return 'college';
    case 'pending_academic_vp': return 'academic_vp';
    case 'pending_admin_vp': return 'admin_vp';
    case 'pending_finance': return 'finance';
    case 'paid': return 'paid';
    default: return '';
  }
}

function historyAt(history, actions) {
  const entry = (history || [])
    .filter(item => actions.includes(item.action))
    .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))[0];
  return entry?.at || null;
}

function buildJourney({ internshipReturn, request, paymentCompleted, reopenAllowed }) {
  if (!internshipReturn) return [];

  const history = request?.batch?.history || [];
  const previousPaidCycle = Boolean(reopenAllowed && request?.status === 'paid');
  // A CS rejection happens before a batch exists. A College rejection belongs
  // to an existing batch, so the student should see College as the stage that
  // needs correction rather than being sent back to CS visually.
  const rejectedKey = request?.batch && request?.status === 'rejected' ? 'college' : 'cs';
  const currentKey = internshipReturn.status === 'rejected'
    ? rejectedKey
    : previousPaidCycle
      ? 'cs'
      : paymentCompleted
        ? 'paid'
        : stageFromRequestStatus(request?.status)
          || (internshipReturn.verified ? 'cs' : 'submitted');
  const currentIndex = Math.max(0, JOURNEY_STAGES.findIndex(stage => stage.key === currentKey));

  const dates = {
    submitted: internshipReturn.createdAt,
    cs: internshipReturn.verifiedAt || historyAt(history, ['verify_return', 'submit_return']),
    college: historyAt(history, ['approved', 'approve_batch', 'forwarded_to_college']),
    academic_vp: historyAt(history, ['endorsed']),
    admin_vp: historyAt(history, ['authorized', 'payment_confirmed']),
    finance: request?.status === 'paid'
      ? (request.updatedAt || request.batch?.financePaidAt)
      : (request?.status === 'pending_finance' ? request.updatedAt : null),
    paid: request?.status === 'paid'
      ? (request.updatedAt || request.batch?.financePaidAt)
      : null,
  };

  const rejectionAt = historyAt(history, ['rejected']) || internshipReturn.updatedAt;

  return JOURNEY_STAGES.map((stage, index) => {
    const previousPayment = previousPaidCycle && stage.key === 'paid';
    return {
      ...stage,
      previous: previousPayment,
      at: internshipReturn.status === 'rejected' && stage.key === currentKey
        ? rejectionAt
        : dates[stage.key] || null,
      state: internshipReturn.status === 'rejected' && stage.key === currentKey
        ? 'rejected'
        : index < currentIndex
          ? 'done'
          : index === currentIndex
            ? 'current'
            : previousPayment
              ? 'done'
              : 'pending',
    };
  });
}

/**
 * Get student's own submission status
 */
exports.myStatus = async (req, res) => {
  try {
    const internshipReturn = await Return.findOne({ student: req.user._id })
      .populate('verifiedBy', 'fullName');

    const letter = internshipReturn
      ? await Letter.findOne({ return: internshipReturn._id })
      : null;

    let paymentRequest = null;
    let paymentRequests = [];
    let paymentStatus = null;
    let activePaymentRequest = null;
    let latestPaidRequest = null;
    let paymentCompleted = false;
    let hasActivePaidInCycle = false;

    try {
      paymentRequests = await PaymentRequest.find({ student: req.user._id })
        .sort('-createdAt')
        .populate('batch', 'batchName batchCode batchMonth semester academicYear status financePaidAt updatedAt history');

      // Legacy demo data may contain one request per stage for the same
      // return. Prefer the paid request in that case. A request explicitly
      // reopened by the CS Department is history, not the current cycle.
      const currentCycle = paymentRequests.filter(request => !request.reopenedAt);
      const paidInCycle = currentCycle
        .filter(request => request.status === 'paid')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
      const openInCycle = currentCycle
        .filter(request => !['paid', 'rejected'].includes(request.status))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;

      activePaymentRequest = openInCycle;
      latestPaidRequest = paymentRequests
        .filter(request => request.status === 'paid')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
      paymentRequest = paidInCycle || openInCycle || paymentRequests[0] || null;
      hasActivePaidInCycle = Boolean(paidInCycle);
      paymentCompleted = Boolean(paidInCycle && !openInCycle);

      if (paymentRequest) {
        try {
          const TeleBirr = require('../services/telebirr.service');
          paymentStatus = await TeleBirr.checkPaymentStatus?.(paymentRequest._id);
        } catch (_) { /* optional */ }
      }
    } catch (_) { /* optional */ }

    // The student's own registered details (never another student's record).
    // The phone is important: TeleBirr pays this exact registered number.
    const profile = {
      id: req.user._id,
      fullName: req.user.fullName,
      institutionalId: req.user.institutionalId,
      username: req.user.username,
      email: req.user.email || '',
      phone: req.user.phone || '',
      program: req.user.program || '',
      year: req.user.year || null,
      semester: req.user.semester || '',
      department: req.user.department || 'Computer Science',
    };

    // Missing information checklist so the student knows exactly what to fix.
    const docs = await loadStudentDocuments([req.user._id]);
    const missingInfo = studentMissingInfo(req.user, internshipReturn, docs.letterByReturn.get(String(internshipReturn?._id)) || null);

    const reopenPermission = {
      allowed: Boolean(req.user.paymentReopenAllowed),
      reason: req.user.paymentReopenReason || '',
      grantedAt: req.user.paymentReopenGrantedAt || null,
      requestedAt: req.user.paymentReopenRequestedAt || null,
      hasPaidPayment: Boolean(latestPaidRequest),
    };
    const canUpdateInformation = !hasActivePaidInCycle || reopenPermission.allowed;
    const journey = buildJourney({
      internshipReturn,
      request: paymentRequest,
      paymentCompleted,
      reopenAllowed: reopenPermission.allowed,
    });
    const currentStage = journey.find(stage => stage.state === 'current')?.key
      || (internshipReturn?.status === 'rejected' ? 'cs' : '')
      || (paymentCompleted ? 'paid' : '');

    res.json({
      profile,
      return: internshipReturn,
      letter,
      paymentRequest,
      paymentRequests,
      activePaymentRequest,
      latestPaidRequest,
      paymentCompleted,
      paymentPhone: profile.phone || paymentRequest?.studentPhone || '',
      paymentStatus,
      journey,
      currentStage,
      reopenPermission,
      canUpdateInformation,
      workflowStatus: getWorkflowStatus(
        paymentCompleted ? 'paid' : (paymentRequest?.status || (internshipReturn?.verified ? 'verified' : internshipReturn?.status) || 'none')
      ),
      canResubmit: internshipReturn?.status === 'rejected'
        || (Boolean(latestPaidRequest) && reopenPermission.allowed),
      missingInfo,
      fixPage: missingInfo.length ? fixPageFor(missingInfo) : null,
    });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ message: 'Failed to get status' });
  }
};

/**
 * Get payment history for student
 */
exports.myPaymentHistory = async (req, res) => {
  try {
    const PaymentRequest = require('../models/PaymentRequest');
    const requests = await PaymentRequest.find({ student: req.user._id })
      .populate('batch', 'batchName semester academicYear')
      .populate('return', 'orgName startDate endDate')
      .sort('-createdAt');

    let payments = requests.map(r => ({ request: r, transaction: null }));

    try {
      const TeleBirr = require('../services/telebirr.service');
      payments = await Promise.all(requests.map(async (r) => {
        const transaction = await TeleBirr.getTransactionByRequest?.(r._id);
        return { request: r, transaction };
      }));
    } catch (_) { /* optional */ }

    res.json({ payments });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({ message: 'Failed to get payment history' });
  }
};

// ============================================
// COMPLETION LETTER UPLOAD (with re-upload support)
// ============================================

/**
 * Upload or RE-UPLOAD completion letter
 * Allowed when: no letter yet, OR previous submission was rejected
 */
exports.uploadLetter = async (req, res) => {
  try {
    const internshipReturn = await Return.findOne({ student: req.user._id });

    if (!internshipReturn) {
      return res.status(400).json({
        message: 'Submit your internship return form first before uploading a letter'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: 'No file uploaded. Please select a completion letter (PDF, JPG or PNG).'
      });
    }

    // If letter already exists
    const existingLetter = await Letter.findOne({ return: internshipReturn._id });
    if (existingLetter) {
      // Allow re-upload when the submission was rejected, the letter is not
      // verified yet, or the CS Department opened a controlled update window
      // after payment.
      if (
        internshipReturn.status === 'rejected' ||
        !existingLetter.isVerified ||
        req.user.paymentReopenAllowed
      ) {
        // Delete old letter and allow new one
        await Letter.deleteOne({ _id: existingLetter._id });
      } else {
        return res.status(409).json({
          message: 'Completion letter already uploaded and verified. You cannot change it after payment. Contact the CS Department if a correction is needed.',
          existingLetter
        });
      }
    }

    // Store the path RELATIVE to the served uploads folder (e.g.
    // "uploads/letters/123-abc.pdf") so it can be turned into a URL later.
    const relativePath = path
      .relative(upload.UPLOADS_ROOT, req.file.path)
      .replace(/\\/g, '/');

    // Create new letter record
    const letter = await Letter.create({
      return: internshipReturn._id,
      student: req.user._id,
      filePath: `uploads/${relativePath}`,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      isVerified: false,
    });

    await AuditLog.create({
      user: req.user._id,
      action: 'upload_letter',
      targetId: internshipReturn._id,
      targetType: 'InternshipReturn',
      meta: {
        fileType: letter.fileType,
        fileSize: letter.fileSize,
      },
    });

    res.status(201).json({
      message: 'Completion letter uploaded successfully. Awaiting CS Department verification.',
      letter,
    });
  } catch (error) {
    console.error('Upload letter error:', error);
    res.status(500).json({ message: 'Failed to upload letter. Please try again.' });
  }
};

/**
 * Get student's letter
 */
exports.getLetter = async (req, res) => {
  try {
    const internshipReturn = await Return.findOne({ student: req.user._id });

    if (!internshipReturn) {
      return res.status(404).json({ message: 'No internship return found' });
    }

    const letter = await Letter.findOne({ return: internshipReturn._id });

    if (!letter) {
      return res.status(404).json({ message: 'No completion letter uploaded yet' });
    }

    res.json({ letter });
  } catch (error) {
    console.error('Get letter error:', error);
    res.status(500).json({ message: 'Failed to get letter' });
  }
};

// ============================================
// NOTIFICATIONS
// ============================================

/**
 * Get student's notifications
 */
exports.myNotifications = async (req, res) => {
  try {
    const list = await Notification.find({ recipient: req.user._id })
      .sort('-createdAt')
      .limit(50);

    res.json(list);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Failed to get notifications' });
  }
};

/**
 * Mark notifications as read
 */
exports.markRead = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Notification IDs required' });
    }

    await Notification.updateMany(
      { recipient: req.user._id, _id: { $in: ids } },
      { isRead: true }
    );

    res.json({ ok: true, marked: ids.length });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ message: 'Failed to mark notifications' });
  }
};

/**
 * Get unread notification count
 */
exports.unreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });

    res.json({ count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ message: 'Failed to get count' });
  }
};

// ============================================
// STUDENT IDENTITY VERIFICATION
// ============================================

/**
 * Student identity verification
 * (Can also be done by Admin)
 */
exports.verifyIdentity = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'Account not found' });
    }

    if (user.role !== 'student') {
      return res.status(403).json({ message: 'Only students can verify identity' });
    }

    if (user.verifiedIdentity) {
      return res.status(409).json({ message: 'Identity already verified' });
    }

    user.verifiedIdentity = true;
    await user.save();

    await AuditLog.create({
      user: req.user._id,
      action: 'student_verified_self',
      targetId: user._id,
      targetType: 'User',
      meta: {
        username: user.username,
        institutionalId: user.institutionalId,
      },
    });

    // Notify admin
    const admins = await User.find({ role: 'admin', accountStatus: 'active' });
    if (admins.length > 0) {
      await Notification.create({
        recipient: admins[0]._id,
        message: `✅ Student ${user.fullName} (${user.institutionalId}) has completed identity verification.`,
        type: 'verification',
      });
    }

    res.json({
      message: 'Identity verified successfully. You can now log in.',
      verified: true,
    });
  } catch (error) {
    console.error('Verify identity error:', error);
    res.status(500).json({ message: 'Failed to verify identity' });
  }
};

/**
 * Update the student's OWN registered information.
 * The University ID and full name are NOT editable by the student (they are
 * identity fields).  Phone number, email, program and year of study may be
 * corrected when the College Office requests missing information.
 */
exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'Account not found' });
    if (user.role !== 'student') return res.status(403).json({ message: 'Only students can update their profile here' });

    const paidRequest = await PaymentRequest.findOne({
      student: user._id,
      status: 'paid',
      reopenedAt: null,
    }).select('_id');
    if (paidRequest && !user.paymentReopenAllowed) {
      return res.status(409).json({
        message: 'Your payment has already been completed, so your personal information is locked. Contact the CS Department if a correction is needed.',
        locked: true,
      });
    }

    const updates = {};

    if (req.body.phone !== undefined) {
      const phoneRaw = String(req.body.phone).trim();
      if (!phoneRaw) return res.status(400).json({ message: 'Registered TeleBirr phone is required', field: 'phone' });
      const phone = normalizePhone(phoneRaw);
      if (!/^\+?\d{9,15}$/.test(phone)) {
        return res.status(400).json({ message: 'Invalid phone number. Use 9–15 digits — local (0911223344) and international (+251911223344) formats are both accepted.', field: 'phone' });
      }
      // Ensure it remains unique across local/international spellings.
      const phoneVariants = [...new Set([
        phone,
        phoneRaw,
        phone.replace(/^\+251/, '0'),
        phone.replace(/^\+251/, ''),
      ].filter(Boolean))];
      const exists = await User.findOne({ phone: { $in: phoneVariants }, _id: { $ne: user._id } }).select('_id');
      if (exists) return res.status(409).json({ message: 'This phone number is already registered to another account', field: 'phone' });
      updates.phone = phone;
    }

    if (req.body.email !== undefined) {
      const email = String(req.body.email).trim().toLowerCase();
      if (!email) return res.status(400).json({ message: 'Email is required', field: 'email' });
      if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Invalid email address', field: 'email' });
      const exists = await User.findOne({ email, _id: { $ne: user._id } }).select('_id');
      if (exists) return res.status(409).json({ message: 'This email is already registered to another account', field: 'email' });
      updates.email = email;
    }

    if (req.body.program !== undefined) {
      const program = String(req.body.program).trim();
      if (!program) return res.status(400).json({ message: 'Program / department is required', field: 'program' });
      updates.program = program;
    }

    if (req.body.year !== undefined) {
      const yearNumber = Number(req.body.year);
      if (!Number.isInteger(yearNumber) || yearNumber < 1 || yearNumber > 7) {
        return res.status(400).json({ message: 'Year of study must be between 1 and 7', field: 'year' });
      }
      updates.year = yearNumber;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'Nothing to update. Provide phone, email, program or year of study.' });
    }

    Object.assign(user, updates);
    await user.save();

    // Keep pending payment requests in sync with the registered phone
    if (updates.phone) {
      try {
        await PaymentRequest.updateMany(
          { student: user._id, status: { $nin: ['paid'] } },
          { $set: { studentPhone: updates.phone } }
        );
      } catch (e) { console.error('Failed to sync request phones:', e.message); }
    }

    await AuditLog.create({
      user: user._id,
      action: 'student_update_profile',
      targetId: user._id,
      targetType: 'User',
      meta: updates,
    });

    // Notify the offices that requested a correction. The update is added to
    // the same conversation and the request is marked resolved.
    try {
      await notifyCorrectedInformation({
        student: user,
        kind: 'profile',
        resubmitted: true,
        summary: `Student ${user.fullName} (${user.institutionalId}) updated their registered information. Please review the corrected details and continue the review.`,
      });
    } catch (e) { console.error('Failed to notify offices about profile update:', e.message); }

    const profile = {
      id: user._id,
      fullName: user.fullName,
      institutionalId: user.institutionalId,
      username: user.username,
      email: user.email || '',
      phone: user.phone || '',
      program: user.program || '',
      year: user.year || null,
      semester: user.semester || '',
      department: user.department || 'Computer Science',
    };

    // Recompute missing info after update
    const internshipReturn = await Return.findOne({ student: user._id });
    const docs = await loadStudentDocuments([user._id]);
    const missingInfo = studentMissingInfo(user, internshipReturn, docs.letterByReturn.get(String(internshipReturn?._id)) || null);

    res.json({
      message: 'Your information was updated successfully. If the College requested corrections, you can now resubmit for review.',
      profile,
      missingInfo,
      fixPage: missingInfo.length ? fixPageFor(missingInfo) : null,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
};

// ============================================
// HELPERS
// ============================================

/**
 * Get human-readable workflow status
 */
function getWorkflowStatus(status) {
  const statuses = {
    submitted: {
      label: 'Submitted',
      description: 'Your submission is awaiting CS Department verification',
      step: 1,
      totalSteps: 6
    },
    pending_department: {
      label: 'Under Review',
      description: 'CS Department is reviewing your submission',
      step: 2,
      totalSteps: 6
    },
    verified: {
      label: 'Verified',
      description: 'CS Department has verified your submission',
      step: 2,
      totalSteps: 6
    },
    pending_college: {
      label: 'College Review',
      description: 'College Office is reviewing your documents',
      step: 3,
      totalSteps: 6
    },
    pending_academic_vp: {
      label: 'Academic Review',
      description: 'Academic VP is verifying your academic eligibility',
      step: 4,
      totalSteps: 6
    },
    pending_admin_vp: {
      label: 'Admin Review',
      description: 'Admin VP is authorizing the payment',
      step: 5,
      totalSteps: 6
    },
    pending_finance: {
      label: 'Payment Processing',
      description: 'Finance is processing your payment via TeleBirr',
      step: 6,
      totalSteps: 6
    },
    paid: {
      label: 'Paid',
      description: '✅ Your payment has been completed via TeleBirr!',
      step: 6,
      totalSteps: 6
    },
    rejected: {
      label: 'Rejected',
      description: 'Your request was rejected. Check notifications for the reason and resubmit correct information.',
      step: 0,
      totalSteps: 6
    },
  };

  return statuses[status] || { label: status, description: 'Unknown status', step: 0, totalSteps: 6 };
}