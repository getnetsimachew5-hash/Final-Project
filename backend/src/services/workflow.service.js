const Batch      = require('../models/PaymentBatch');
const Request    = require('../models/PaymentRequest');
const Return     = require('../models/InternshipReturn');
const Letter     = require('../models/CompletionLetter');
const User       = require('../models/User');
const AuditLog   = require('../models/AuditLog');
const TeleBirrTransaction      = require('../models/TeleBirrTransaction');
const PaymentSettings          = require('../models/PaymentSettings');
const TeleBirr   = require('./telebirr.service');
const Notification = require('../models/Notification');
const { deliver, markResolved } = require('./message.service');
const { internshipDays } = require('../utils/dates');
const { STUDENT_POPULATE } = require('../utils/studentFields');
const { normalizePhone, requestPhone, syncRequestPhone } = require('../utils/paymentPhone');
const {
  batchIdentity,
  batchIdentityFilter,
  nextBatchCode,
} = require('../utils/batchIdentity');

/**
 * ============================================
 * SIPMS WORKFLOW SERVICE
 * ============================================
 * Orchestrates the complete 6-actor approval pipeline:
 *
 * Stage 1: Student → CS Department (submission & verification)
 * Stage 2: CS Department → College Office (batch creation & forwarding)
 * Stage 3: College Office → Academic VP (formal review)
 * Stage 4: Academic VP → Admin VP (academic eligibility)
 * Stage 5: Admin VP → Finance (administrative authorization)
 * Stage 6: Finance → Student (payment via TeleBirr)
 *
 * Each stage can APPROVE (forward) or REJECT (send back for correction).
 * ============================================
 */

// ============================================
// WORKFLOW STAGE DEFINITIONS
// ============================================
const WORKFLOW_STAGES = [
  {
    stage: 'draft',
    actor: 'cs_dept',
    nextStage: 'pending_college',
    actorName: 'CS Department',
    action: 'Create Batch',
    description: 'CS Department verifies submissions and creates payment batch',
  },
  {
    stage: 'pending_college',
    actor: 'college',
    nextStage: 'pending_academic_vp',
    actorName: 'College Office',
    action: 'Review Documents',
    description: 'College Office reviews student documents and completion letters',
  },
  {
    stage: 'pending_academic_vp',
    actor: 'academic_vp',
    nextStage: 'pending_admin_vp',
    actorName: 'Academic VP Office',
    action: 'Verify Academic Eligibility',
    description: 'Academic VP verifies student academic standing',
  },
  {
    stage: 'pending_admin_vp',
    actor: 'admin_vp',
    nextStage: 'pending_finance',
    actorName: 'Administrative VP Office',
    action: 'Authorize Payment',
    description: 'Admin VP authorizes financial allocation and forwards directly to Finance',
  },
  {
    stage: 'pending_finance',
    actor: 'finance',
    nextStage: 'paid',
    actorName: 'Finance Office',
    action: 'Process Payment',
    description: 'Finance processes payment via TeleBirr',
  },
];

/**
 * Get the current workflow stage for a batch status
 */
exports.getStage = (status) => {
  return WORKFLOW_STAGES.find(s => s.stage === status);
};

/**
 * Generic APPROVE/FORWARD dispatcher.
 *
 * For a long time the department controller called `workflow.advance(...)`,
 * but no such export existed — forwarding draft batches crashed at runtime
 * with "workflow.advance is not a function" and the CS Dept → College step
 * was impossible. This dispatcher (plus the matching reject below) restores
 * that link: it finds the batch's current stage and runs the stage's handler.
 */
exports.advance = async ({ batchId, actor, comment }) => {
  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');

  const handlers = {
    draft:               exports.csDeptForwardBatch,
    pending_college:     exports.collegeApproveBatch,
    pending_academic_vp: exports.academicVpEndorseBatch,
    pending_admin_vp:    exports.adminVpAuthorizeBatch,
    pending_finance:     null, // finance pays via its own endpoints, not forward
  };

  const handler = handlers[batch.status];
  if (!handler || typeof handler !== 'function') {
    throw new Error(`Batches in "${batch.status}" cannot be forwarded — Finance processes payments directly`);
  }
  return handler({ userId: actor._id, batchId, comment });
};

/**
 * Generic REJECT dispatcher — routes a rejection to the stage's reject handler.
 */
exports.reject = async ({ batchId, actor, comment }) => {
  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');

  const rejectHandlers = {
    draft:               null, // drafts are cancelled via /cancel, not rejected
    pending_college:     exports.collegeRejectBatch,
    pending_academic_vp: exports.academicVpRejectBatch,
    pending_admin_vp:    exports.adminVpRejectBatch,
    pending_finance:     null,
  };

  const handler = rejectHandlers[batch.status];
  if (!handler || typeof handler !== 'function') {
    throw new Error(`Batches in "${batch.status}" cannot be rejected from this endpoint`);
  }
  return handler({ userId: actor._id, batchId, comment });
};

/**
 * Get all stages for display/debugging
 */
exports.getAllStages = () => WORKFLOW_STAGES;

// ============================================
// ACTOR 1: STUDENT - Internship Submission
// ============================================

/**
 * Student submits internship return form
 * Creates the foundation for the entire payment pipeline
 */
exports.studentSubmitReturn = async ({ userId, data }) => {
  const { orgName, orgAddress, supervisorName, supervisorPhone, startDate, endDate } = data;

  // Validate required fields
  if (!orgName || !orgAddress || !supervisorName || !startDate || !endDate) {
    throw new Error('All fields are required: organization, address, supervisor, dates');
  }

  // Check if student already has a submission
  const existing = await Return.findOne({ student: userId });
  if (existing) {
    throw new Error('You already submitted your internship return. You can only submit once per semester.');
  }

  // Create the internship return
  const internshipReturn = await Return.create({
    student: userId,
    orgName,
    orgAddress,
    supervisorName,
    supervisorPhone,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    status: 'submitted',
  });

  // Log the action
  await AuditLog.create({
    user: userId,
    action: 'submit_return',
    targetId: internshipReturn._id,
    targetType: 'InternshipReturn',
    meta: { orgName, supervisorName },
  });

  return internshipReturn;
};

/**
 * Student uploads completion letter
 * Required document for CS Department verification
 */
exports.studentUploadLetter = async ({ userId, returnId, filePath, fileType, fileSize }) => {
  // Verify the return belongs to this student
  const internshipReturn = await Return.findOne({ _id: returnId, student: userId });
  if (!internshipReturn) {
    throw new Error('Internship return not found or not yours');
  }

  // Check if letter already exists
  const existing = await Letter.findOne({ return: returnId });
  if (existing) {
    throw new Error('Completion letter already uploaded');
  }

  // Create the letter record
  const letter = await Letter.create({
    return: returnId,
    student: userId,
    filePath,
    fileType,
    fileSize,
    isVerified: false,
  });

  await AuditLog.create({
    user: userId,
    action: 'upload_letter',
    targetId: returnId,
    targetType: 'InternshipReturn',
    meta: { fileType, fileSize },
  });

  return letter;
};

// ============================================
// ACTOR 2: CS DEPARTMENT - Verification & Batch Creation
// ============================================

/**
 * CS Department views all student submissions
 * First actor to review student work
 */
exports.csDeptViewSubmissions = async () => {
  return await Return.find()
    .populate('student', STUDENT_POPULATE)
    .populate('verifiedBy', 'fullName')
    .sort('-createdAt');
};

/**
 * CS Department verifies a student's submission
 * Checks that all required documents are present
 */
exports.csDeptVerifyReturn = async ({ userId, returnId }) => {
  const internshipReturn = await Return.findById(returnId);
  if (!internshipReturn) {
    throw new Error('Submission not found');
  }

  // Check for completion letter
  const letter = await Letter.findOne({ return: returnId });
  if (!letter) {
    throw new Error('Cannot verify: No completion letter uploaded. Request student to upload.');
  }

  // Mark as verified
  internshipReturn.verified = true;
  internshipReturn.verifiedAt = new Date();
  internshipReturn.verifiedBy = userId;
  await internshipReturn.save();

  // Mark letter as verified
  letter.isVerified = true;
  await letter.save();

  await AuditLog.create({
    user: userId,
    action: 'verify_return',
    targetId: returnId,
    targetType: 'InternshipReturn',
    meta: { studentName: internshipReturn.student.fullName },
  });

  return internshipReturn;
};

/**
 * CS Department unverifies a return (for corrections)
 */
exports.csDeptUnverifyReturn = async ({ returnId }) => {
  const internshipReturn = await Return.findByIdAndUpdate(
    returnId,
    { verified: false, verifiedAt: null, verifiedBy: null },
    { new: true }
  );

  if (!internshipReturn) {
    throw new Error('Submission not found');
  }

  await Letter.updateOne({ return: returnId }, { isVerified: false });

  await AuditLog.create({
    user: userId,
    action: 'unverify_return',
    targetId: returnId,
    targetType: 'InternshipReturn',
  });

  return internshipReturn;
};

/**
 * CS Department creates a payment batch
 * Groups verified students for batch processing
 */
exports.csDeptCreateBatch = async ({ userId, batchData }) => {
  const { batchName, semester, academicYear, batchMonth, studentIds } = batchData;

  // Validate
  if (!batchName || !semester || !academicYear || !studentIds || studentIds.length === 0) {
    throw new Error('Batch name, semester, academic year, and students are required');
  }

  // Check all students are verified
  const verifiedReturns = await Return.find({
    student: { $in: studentIds },
    verified: true
  });

  const verifiedIds = new Set(verifiedReturns.map(r => r.student.toString()));
  const unverified = studentIds.filter(id => !verifiedIds.has(id.toString()));

  if (unverified.length > 0) {
    throw new Error(`${unverified.length} student(s) not verified. Only verified students can be added to batch.`);
  }

  // TeleBirr always pays the phone number registered on the student account.
  const students = await User.find({ _id: { $in: studentIds }, role: 'student' })
    .select('fullName phone')
    .lean();
  const studentById = new Map(students.map(student => [String(student._id), student]));
  const missingPhone = studentIds.filter(id => !normalizePhone(studentById.get(String(id))?.phone));
  if (missingPhone.length > 0) {
    throw new Error(
      `${missingPhone.length} student(s) have no registered phone number. Ask them to update their account before creating the batch.`
    );
  }

  // A batch name may repeat in another month / semester / academic year. The
  // generated `batchCode` is what makes each batch unique.
  const identity = batchIdentity({ batchName, semester, academicYear, batchMonth });
  const existingBatch = await Batch.findOne(batchIdentityFilter(identity));
  if (existingBatch) {
    throw new Error(
      `Batch "${identity.batchName}" already exists for ${identity.batchMonth || 'the same period'} · ${identity.semester} · ${identity.academicYear}. Choose a different month or academic year.`
    );
  }

  // Create batch
  const batch = await Batch.create({
    batchName: identity.batchName,
    batchMonth: identity.batchMonth,
    batchCode: await nextBatchCode(Batch, identity),
    semester,
    academicYear,
    createdBy: userId,
    students: studentIds,
    status: 'draft',
  });

  // Create payment requests for each student
  const requests = await Promise.all(studentIds.map(async (studentId) => {
    const ret = verifiedReturns.find(r => r.student.toString() === studentId.toString());
    const { dailyRate, durationDays, amount } = await TeleBirr.computeAmount(ret);

    return {
      batch: batch._id,
      student: studentId,
      return: ret?._id,
      dailyRate,
      durationDays,
      amount,
      // Snapshot the REGISTERED phone; Finance refreshes it from the account
      // immediately before initiating TeleBirr.
      studentPhone: normalizePhone(studentById.get(String(studentId))?.phone),
      status: 'pending_department',
    };
  }));

  await Request.insertMany(requests);

  // Add history entry
  batch.history.push({
    actor: userId,
    action: 'created',
    comment: `Batch created with ${studentIds.length} students`,
    at: new Date(),
  });
  await batch.save();

  await AuditLog.create({
    user: userId,
    action: 'create_batch',
    targetId: batch._id,
    targetType: 'PaymentBatch',
    meta: { batchName, studentCount: studentIds.length },
  });

  return batch;
};

/**
 * CS Department forwards batch to College
 * Transitions batch from draft to pending_college
 */
exports.csDeptForwardBatch = async ({ userId, batchId, comment }) => {
  if (!comment || !comment.trim()) {
    throw new Error('A forwarding comment is required');
  }

  const stage = exports.getStage('draft');
  if (!stage) throw new Error('Invalid workflow stage');

  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'draft') {
    throw new Error(`Batch is already ${batch.status}. Can only forward from draft.`);
  }

  // Update status
  batch.status = stage.nextStage;
  batch.history.push({
    actor: userId,
    action: 'forwarded_to_college',
    comment: comment.trim(),
    at: new Date(),
  });
  await batch.save();

  // Update all requests in batch
  await Request.updateMany(
    { batch: batchId, status: 'pending_department' },
    { status: stage.nextStage }
  );

  // Notify College Office
  await notifyRole('college', batch, `Batch "${batch.batchName}" forwarded to College Office for review.`, userId, comment);

  await AuditLog.create({
    user: userId,
    action: 'forward_batch',
    targetId: batchId,
    targetType: 'PaymentBatch',
    meta: { nextStage: stage.nextStage, comment },
  });

  return batch;
};

// ============================================
// ACTOR 3: COLLEGE OFFICE - Document Review
// ============================================

/**
 * College Office views batches pending their review
 */
exports.collegeViewBatches = async () => {
  return await Batch.find({ status: 'pending_college' })
    .populate('students', STUDENT_POPULATE)
    .populate('createdBy', 'fullName')
    .populate('history.actor', 'fullName role')
    .sort('-createdAt');
};

/**
 * College Office approves batch
 * Forwards to Academic VP for academic eligibility check
 */
exports.collegeApproveBatch = async ({ userId, batchId, comment }) => {
  if (!comment || !comment.trim()) {
    throw new Error('Approval comment is required');
  }

  const stage = exports.getStage('pending_college');
  if (!stage) throw new Error('Invalid workflow stage');

  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'pending_college') {
    throw new Error(`Batch is ${batch.status}. Can only approve from pending_college.`);
  }

  // Update status
  batch.status = stage.nextStage;
  batch.history.push({
    actor: userId,
    action: 'approved',
    comment: comment.trim(),
    at: new Date(),
  });
  await batch.save();

  // Update all requests — students the College already rejected at the
  // per-student stage must NOT be dragged along to the Academic VP.
  await Request.updateMany(
    { batch: batchId, status: { $in: ['pending_college', 'college_approved'] } },
    { status: stage.nextStage }
  );

  // Notify Academic VP
  await notifyRole('academic_vp', batch, `Batch "${batch.batchName}" approved by College and forwarded to Academic VP.`, userId, comment);

  await AuditLog.create({
    user: userId,
    action: 'approve_batch',
    targetId: batchId,
    targetType: 'PaymentBatch',
    meta: { nextStage: stage.nextStage, comment },
  });

  return batch;
};

/**
 * College Office rejects batch
 * Sends back to CS Department for correction
 */
exports.collegeRejectBatch = async ({ userId, batchId, comment }) => {
  if (!comment || !comment.trim()) {
    throw new Error('Rejection reason is required');
  }

  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'pending_college') {
    throw new Error(`Batch is ${batch.status}. Can only reject from pending_college.`);
  }

  // Update status
  batch.status = 'rejected';
  batch.rejectionReason = comment.trim();
  batch.history.push({
    actor: userId,
    action: 'rejected',
    comment: comment.trim(),
    at: new Date(),
  });
  await batch.save();

  // Update all requests with rejection
  await Request.updateMany(
    { batch: batchId },
    { status: 'rejected', rejectionReason: comment.trim() }
  );

  // Update all returns
  await Return.updateMany(
    { student: { $in: batch.students } },
    { status: 'rejected', rejectionReason: comment.trim() }
  );

  // Notify students
  await notifyStudents(batch, 'rejected', userId, comment);

  // Notify CS Department
  await notifyRole('cs_dept', batch, `Batch "${batch.batchName}" rejected by College. Review and correct.`, userId, comment);

  await AuditLog.create({
    user: userId,
    action: 'reject_batch',
    targetId: batchId,
    targetType: 'PaymentBatch',
    meta: { reason: comment, previousStatus: 'pending_college' },
  });

  return batch;
};

// ============================================
// ACTOR 4: ACADEMIC VP - Academic Eligibility
// ============================================

/**
 * Academic VP views batches pending their review
 */
exports.academicVpViewBatches = async () => {
  return await Batch.find({ status: 'pending_academic_vp' })
    .populate('students', STUDENT_POPULATE)
    .populate('history.actor', 'fullName role')
    .sort('-createdAt');
};

/**
 * Academic VP endorses batch
 * Confirms academic eligibility, forwards to Admin VP
 */
exports.academicVpEndorseBatch = async ({ userId, batchId, comment }) => {
  if (!comment || !comment.trim()) {
    throw new Error('Endorsement comment is required');
  }

  const stage = exports.getStage('pending_academic_vp');
  if (!stage) throw new Error('Invalid workflow stage');

  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'pending_academic_vp') {
    throw new Error(`Batch is ${batch.status}. Can only endorse from pending_academic_vp.`);
  }

  // Everything the College sent for this batch must move forward together,
  // otherwise single students stay stuck at a stage that no office can open
  // any more ('college_approved' / 'pending_college' leftovers from an
  // incomplete forward are carried along here on purpose).
  const movingStatuses = ['pending_academic_vp', 'college_approved', 'pending_college'];
  const waiting = await Request.countDocuments({ batch: batchId, status: { $in: movingStatuses } });
  if (waiting === 0) {
    throw new Error('This batch has no student requests waiting for Academic VP approval.');
  }

  batch.status = stage.nextStage;
  batch.adminVpDecision = null;
  batch.adminVpComment = null;
  batch.adminVpDecidedBy = null;
  batch.adminVpDecidedAt = null;
  batch.adminVpForwardedAt = null;
  batch.authorizedAmount = null;
  batch.paymentReference = null;
  batch.paymentConfirmedBy = null;
  batch.paymentConfirmedAt = null;
  batch.history.push({
    actor: userId,
    action: 'endorsed',
    comment: comment.trim(),
    at: new Date(),
  });
  await batch.save();

  await Request.updateMany(
    { batch: batchId, status: { $in: movingStatuses } },
    { status: stage.nextStage, rejectionReason: null }
  );

  await notifyRole('admin_vp', batch, `Batch "${batch.batchName}" academically endorsed. Forwarded to Admin VP for authorization.`, userId, comment);

  await AuditLog.create({
    user: userId,
    action: 'endorse_batch',
    targetId: batchId,
    targetType: 'PaymentBatch',
    meta: { nextStage: stage.nextStage, comment },
  });

  return batch;
};

/**
 * Academic VP rejects batch
 * Sends the batch BACK to the College (pending_college) so the College can
 * correct the information and send it again — a terminal 'rejected' status
 * would leave the College with no way to ever re-forward it.
 */
exports.academicVpRejectBatch = async ({ userId, batchId, comment }) => {
  if (!comment || !comment.trim()) {
    throw new Error('Rejection reason is required');
  }

  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'pending_academic_vp') {
    throw new Error(`Batch is ${batch.status}. Can only reject from pending_academic_vp.`);
  }

  batch.status = 'pending_college';
  batch.rejectionReason = comment.trim();
  batch.history.push({
    actor: userId,
    action: 'returned_to_college',
    comment: comment.trim(),
    at: new Date(),
  });
  await batch.save();

  // The students the College forwarded go back to "not decided" at the
  // College, carrying the Academic VP's reason so it can be corrected.
  const returned = await Request.find({ batch: batchId, status: { $in: ['pending_academic_vp', 'college_approved'] } });
  await Request.updateMany(
    { batch: batchId, status: { $in: ['pending_academic_vp', 'college_approved'] } },
    { status: 'pending_college', rejectionReason: comment.trim() }
  );

  await notifyStudents(batch, 'returned_correction', userId, comment);
  await notifyRole('college', batch, `Batch "${batch.batchName}" returned by Academic VP. Correct the information and send it again.`, userId, comment);

  await AuditLog.create({
    user: userId,
    action: 'return_batch_to_college',
    targetId: batchId,
    targetType: 'PaymentBatch',
    meta: { reason: comment, previousStatus: 'pending_academic_vp', returnedStudents: String(returned.length) },
  });

  return batch;
};

// ============================================
// ACTOR 5: ADMIN VP - Administrative Authorization
// ============================================

/**
 * Admin VP views batches pending their review
 */
exports.adminVpViewBatches = async () => {
  return await Batch.find({ status: 'pending_admin_vp' })
    .populate('students', STUDENT_POPULATE)
    .populate('history.actor', 'fullName role')
    .sort('-createdAt');
};

/**
 * Admin VP confirms payment availability/authorization.
 * Records the amount the office is authorizing and the payment reference
 * before the approve/reject decision. Function 3 of the Admin VP role.
 */
exports.adminVpConfirmPayment = async ({ userId, batchId, authorizedAmount, paymentReference }) => {
  const amount = Number(authorizedAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('A valid authorized amount is required');
  }

  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'pending_admin_vp') {
    throw new Error(`Batch is ${batch.status}. Can only confirm payment from pending_admin_vp.`);
  }

  batch.authorizedAmount = amount;
  batch.paymentReference = (paymentReference || '').trim() || null;
  batch.paymentConfirmedBy = userId;
  batch.paymentConfirmedAt = new Date();
  batch.history.push({
    actor: userId,
    action: 'payment_confirmed',
    comment: `Payment availability confirmed — ${amount.toLocaleString()} ETB authorized`
      + (batch.paymentReference ? ` (ref: ${batch.paymentReference})` : ''),
    at: new Date(),
  });
  await batch.save();

  await AuditLog.create({
    user: userId,
    action: 'confirm_payment',
    targetId: batchId,
    targetType: 'PaymentBatch',
    meta: { authorizedAmount: String(amount), paymentReference: batch.paymentReference || '' },
  });

  return batch;
};

/**
 * Admin VP approves the batch (function 4).
 * This records the decision but does NOT move the batch yet — forwarding to
 * Finance is the explicit next step (function 6).
 */
exports.adminVpApproveBatch = async ({ userId, batchId, comment }) => {
  if (!comment || !comment.trim()) {
    throw new Error('Approval comment is required');
  }

  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'pending_admin_vp') {
    throw new Error(`Batch is ${batch.status}. Can only approve from pending_admin_vp.`);
  }
  if (!batch.paymentConfirmedAt) {
    throw new Error('Payment availability must be confirmed before approving this batch.');
  }

  batch.adminVpDecision = 'approved';
  batch.adminVpComment = comment.trim();
  batch.adminVpDecidedBy = userId;
  batch.adminVpDecidedAt = new Date();
  batch.history.push({
    actor: userId,
    action: 'approved',
    comment: comment.trim(),
    at: new Date(),
  });
  await batch.save();

  await AuditLog.create({
    user: userId,
    action: 'approve_batch',
    targetId: batchId,
    targetType: 'PaymentBatch',
    meta: { decision: 'approved', comment },
  });

  return batch;
};

/**
 * Admin VP forwards the approved batch directly to Finance (function 6).
 * Performs the actual workflow transition: pending_admin_vp → pending_finance,
 * updates every student request and notifies the Finance Office.
 */
exports.adminVpForwardBatch = async ({ userId, batchId }) => {
  const stage = exports.getStage('pending_admin_vp');
  if (!stage) throw new Error('Invalid workflow stage');

  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'pending_admin_vp') {
    throw new Error(`Batch is ${batch.status}. Can only forward from pending_admin_vp.`);
  }
  if (batch.adminVpDecision !== 'approved') {
    throw new Error('The batch must be approved by the Administrative VP before forwarding.');
  }

  batch.status = stage.nextStage;
  batch.adminVpForwardedAt = new Date();

  // A re-forward starts a fresh Finance review. Keep the previous events in
  // `history`, but clear the earlier Finance decision fields so Finance must
  // review the corrected batch again.
  batch.financeReviewConfirmedBy = null;
  batch.financeReviewConfirmedAt = null;
  batch.financeAmountConfirmedBy = null;
  batch.financeAmountConfirmedAt = null;
  batch.financeConfirmedAmount = null;
  batch.financePaymentMode = null;
  batch.financeSelectedRequest = null;
  batch.financeModeSelectedAt = null;
  batch.financeSimulatedBy = null;
  batch.financeSimulatedAt = null;
  batch.financeReference = null;
  batch.financePaymentConfirmedBy = null;
  batch.financePaymentConfirmedAt = null;
  batch.financePaidAt = null;
  batch.financeReportGeneratedAt = null;

  batch.history.push({
    actor: userId,
    action: 'authorized',
    comment: batch.adminVpComment || 'Approved and forwarded to Finance',
    at: new Date(),
  });
  await batch.save();

  await Request.updateMany(
    { batch: batchId, status: 'pending_admin_vp' },
    { status: stage.nextStage }
  );

  await notifyRole('finance', batch, `Batch "${batch.batchName}" authorized by Admin VP. Ready for payment processing.`, userId, batch.adminVpComment);

  await AuditLog.create({
    user: userId,
    action: 'authorize_batch',
    targetId: batchId,
    targetType: 'PaymentBatch',
    meta: { nextStage: stage.nextStage, comment: batch.adminVpComment || '' },
  });

  return batch;
};

/**
 * One-step authorize (kept for the older pages / generic `advance` dispatcher).
 * Approves if there is no decision yet, then forwards.
 */
exports.adminVpAuthorizeBatch = async ({ userId, batchId, comment }) => {
  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'pending_admin_vp') {
    throw new Error(`Batch is ${batch.status}. Can only authorize from pending_admin_vp.`);
  }

  // One-step legacy path: record the payment confirmation automatically so the
  // audit trail still contains function 3 before the approval/forward.
  if (!batch.paymentConfirmedAt) {
    const requests = await Request.find({ batch: batchId });
    const total = requests.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    await exports.adminVpConfirmPayment({
      userId,
      batchId,
      authorizedAmount: total,
      paymentReference: 'One-step authorization',
    });
  }

  if (batch.adminVpDecision !== 'approved') {
    await exports.adminVpApproveBatch({ userId, batchId, comment });
  }

  return exports.adminVpForwardBatch({ userId, batchId });
};

/**
 * Admin VP rejects batch
 * Sends back to Academic VP for correction (batch returns to
 * pending_academic_vp so the Academic VP actually sees it again).
 */
exports.adminVpRejectBatch = async ({ userId, batchId, comment }) => {
  if (!comment || !comment.trim()) {
    throw new Error('Rejection reason is required');
  }

  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'pending_admin_vp') {
    throw new Error(`Batch is ${batch.status}. Can only reject from pending_admin_vp.`);
  }

  batch.status = 'pending_academic_vp';
  batch.rejectionReason = comment.trim();
  batch.adminVpDecision = 'rejected';
  batch.adminVpComment = comment.trim();
  batch.adminVpDecidedBy = userId;
  batch.adminVpDecidedAt = new Date();
  batch.adminVpForwardedAt = null;
  batch.authorizedAmount = null;
  batch.paymentReference = null;
  batch.paymentConfirmedBy = null;
  batch.paymentConfirmedAt = null;
  batch.history.push({
    actor: userId,
    action: 'returned_to_academic_vp',
    comment: comment.trim(),
    at: new Date(),
  });
  await batch.save();

  await Request.updateMany(
    { batch: batchId, status: 'pending_admin_vp' },
    { status: 'pending_academic_vp', rejectionReason: comment.trim() }
  );

  await notifyStudents(batch, 'returned_correction', userId, comment);
  await notifyRole('academic_vp', batch, `Batch "${batch.batchName}" returned by Admin VP. Review the administrative comment and endorse again.`, userId, comment);

  await AuditLog.create({
    user: userId,
    action: 'return_batch_to_academic_vp',
    targetId: batchId,
    targetType: 'PaymentBatch',
    meta: { reason: comment, previousStatus: 'pending_admin_vp' },
  });

  return batch;
};

// ============================================
// ACTOR 7: FINANCE - Payment Processing
// ============================================

/**
 * Finance views batches pending payment
 */
exports.financeViewBatches = async () => {
  return await Batch.find({ status: 'pending_finance' })
    .populate('students', STUDENT_POPULATE)
    .populate('history.actor', 'fullName role')
    .sort('-createdAt');
};

/**
 * Finance views all payment requests
 */
exports.financeViewRequests = async () => {
  return await Request.find({ status: 'pending_finance' })
    .populate('student', STUDENT_POPULATE)
    .populate('batch', 'batchName semester academicYear')
    .populate('return', 'orgName startDate endDate')
    .sort('-createdAt');
};

/**
 * Finance calculates payment amount for a request
 */
exports.financeCalculateAmount = async ({ requestId }) => {
  const request = await Request.findById(requestId)
    .populate('student', STUDENT_POPULATE)
    .populate('return');

  if (!request) throw new Error('Payment request not found');

  const phone = await syncRequestPhone(request);
  const amount = await TeleBirr.computeAmount(request.return);
  return {
    requestId: request._id,
    student: request.student,
    dailyRate: amount.dailyRate,
    durationDays: amount.durationDays,
    amount: amount.amount,
    phone,
  };
};

/**
 * Finance processes payment for a single request via TeleBirr
 */
exports.financeProcessPayment = async ({ userId, requestId }) => {
  const request = await Request.findById(requestId)
    .populate('student', STUDENT_POPULATE)
    .populate('batch');

  if (!request) throw new Error('Payment request not found');
  if (!request.student) {
    throw new Error('This payment request points to a student account that no longer exists. Ask the CS Department to fix the batch.');
  }
  if (request.status === 'paid') {
    // A retried click must never look like a failure: the money was already
    // sent, so report success with the confirmed transaction.
    const existing = await TeleBirrTransaction.findOne({
      request: request._id,
      status: 'confirmed',
    }).sort('-createdAt');

    // Older data may have every request paid while the batch itself was never
    // finalised. Committing it here makes a retried click heal the batch too.
    const batchId = request.batch?._id || request.batch;
    const settlement = batchId
      ? await finalizeBatchIfComplete({ userId, batchId })
      : { finalized: false };

    return {
      request,
      transaction: {
        alreadyPaid: true,
        transactionId: existing?._id || null,
        reference: existing?.reference || request.financeReference || '',
        amount: request.amount,
        dailyRate: request.dailyRate,
        durationDays: request.durationDays,
        phone: request.studentPhone || request.student?.phone || '',
        otp: null,
        status: 'confirmed',
        batchFinalized: Boolean(settlement.finalized),
      },
    };
  }
  if (request.status !== 'pending_finance') {
    throw new Error(`Request is ${request.status}. Can only process pending_finance requests.`);
  }

  // Always pay the phone number registered on the student's account. The
  // request snapshot is refreshed here so old batches cannot pay a stale phone.
  const phone = await syncRequestPhone(request);
  if (!phone) {
    throw new Error('Student phone number required for TeleBirr payment');
  }

  // Simulate TeleBirr payment — creates the transaction and OTP.
  // The request only becomes 'paid' when the OTP is confirmed
  // (see telebirr.confirmPayment), matching the Finance portal's two-step flow.
  const transaction = await TeleBirr.initiatePayment({
    requestId: request._id,
    studentId: request.student._id,
    phone,
    amount: request.amount,
    dailyRate: request.dailyRate,
    durationDays: request.durationDays,
    processedBy: userId,
  });

  // The TeleBirr service already creates the student's OTP notification. Do
  // not create a second one here — one payment attempt must produce one notice.
  await AuditLog.create({
    user: userId,
    action: 'process_payment',
    targetId: request._id,
    targetType: 'PaymentRequest',
    meta: { amount: request.amount, reference: transaction.reference, phone },
  });

  return { request, transaction };
};

/**
 * Pay EVERY pending request of a batch in one go (Finance "Pay Entire Batch").
 * Each student's amount is their own dailyRate × internship days; a TeleBirr
 * transaction + OTP is created for each, then each is auto-confirmed so the
 * whole batch is paid simultaneously and every actor + student is notified.
 * Returns per-student results so the portal can show a success/failure list.
 */
exports.financePayEntireBatch = async ({ userId, batchId }) => {
  const batch = await Batch.findById(batchId)
    .populate('students', STUDENT_POPULATE)
    .populate('history.actor', 'fullName role');

  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'pending_finance') {
    throw new Error(`Batch is ${batch.status}. Can only process pending_finance batches.`);
  }

  const requests = await Request.find({ batch: batchId, status: 'pending_finance' })
    .populate('student', STUDENT_POPULATE);

  if (requests.length === 0) {
    // Every request may already be paid even though the batch was never
    // finalised (older data / interrupted run). Commit the batch instead of
    // blocking the Finance officer.
    const remaining = await Request.countDocuments({ batch: batchId, status: 'pending_finance' });
    const total = await Request.countDocuments({ batch: batchId });
    if (remaining === 0 && total > 0) {
      if (batch.status !== 'paid') {
        batch.status = 'paid';
        batch.financePaidAt = batch.financePaidAt || new Date();
        batch.history.push({
          actor: userId,
          action: 'batch_paid',
          comment: `All ${total} student payment(s) were already completed.`,
          at: new Date(),
        });
        await batch.save();
      }
      return { batch, results: [], successCount: 0, totalCount: total, alreadyPaid: true };
    }
    throw new Error('No pending payment requests in this batch');
  }

  const results = [];
  for (const req of requests) {
    try {
      if (!req.student) {
        results.push({ request: req._id, student: 'Unknown student', success: false, reason: 'Student account no longer exists' });
        continue;
      }

      const phone = await syncRequestPhone(req);
      if (!phone) {
        results.push({ request: req._id, student: req.student?.fullName, success: false, reason: 'No registered phone number' });
        continue;
      }

      // Step 1: initiate (creates transaction + OTP, or reuses a retried one)
      const txn = await TeleBirr.initiatePayment({
        requestId: req._id,
        studentId: req.student._id,
        phone,
        amount: req.amount,
        dailyRate: req.dailyRate,
        durationDays: req.durationDays,
        processedBy: userId,
      });

      if (txn.status === 'confirmed') {
        results.push({
          request: req._id,
          student: req.student.fullName,
          phone,
          amount: req.amount,
          reference: txn.reference,
          success: true,
          alreadyPaid: true,
        });
        continue;
      }

      // Step 2: auto-confirm (simulation) → money sent + student notified
      await TeleBirr.confirmPayment({
        txnId: txn.transactionId,
        otpCode: txn.otp,
        userId,
      });

      results.push({
        request: req._id,
        student: req.student.fullName,
        phone,
        amount: req.amount,
        reference: txn.reference,
        success: true,
      });
    } catch (err) {
      results.push({
        request: req._id,
        student: req.student?.fullName,
        success: false,
        reason: err.message,
      });
    }
  }

  const successCount = results.filter(r => r.success).length;

  // Mark the batch paid only when every student has been paid
  const stillPending = await Request.countDocuments({ batch: batchId, status: 'pending_finance' });
  if (stillPending === 0) {
    batch.status = 'paid';
    batch.financePaidAt = new Date();
  }
  batch.history.push({
    actor: userId,
    action: stillPending === 0 ? 'batch_paid' : 'finance_partial_payment',
    comment: stillPending === 0
      ? `Paid ${successCount} of ${requests.length} students via TeleBirr`
      : `${successCount} student(s) paid; ${stillPending} still awaiting payment`,
    at: new Date(),
  });
  await batch.save();

  // Only announce completion when the whole batch is actually paid. Each
  // student already received their own payment_received notification from
  // TeleBirr.confirmPayment().
  if (stillPending === 0) {
    const actor = await User.findById(userId);
    await notifyAllOffices(batch, 'paid', actor);
  }

  await AuditLog.create({
    user: userId,
    action: 'pay_entire_batch',
    targetId: batchId,
    targetType: 'PaymentBatch',
    meta: { processed: results.length, successful: successCount },
  });

  return { batch, results, successCount, totalCount: requests.length };
};

/**
 * Commit a pending Finance batch to PAID when every one of its requests has
 * already been settled. This is the missing link for the Individual Payment
 * page: paying the last student there must finalise the batch and notify the
 * offices exactly like the batch/guided payment paths do.
 *
 * Safe to call repeatedly — a paid batch or a batch with remaining pending
 * requests is returned untouched.
 */
async function finalizeBatchIfComplete({ userId, batchId }) {
  const batch = await Batch.findById(batchId);
  if (!batch) return { batch: null, finalized: false };

  if (batch.status === 'paid') {
    return { batch, finalized: false, alreadyPaid: true, pendingCount: 0 };
  }
  if (batch.status !== 'pending_finance') {
    return { batch, finalized: false };
  }

  const [pendingCount, paidCount, totalCount] = await Promise.all([
    Request.countDocuments({ batch: batchId, status: 'pending_finance' }),
    Request.countDocuments({ batch: batchId, status: 'paid' }),
    Request.countDocuments({ batch: batchId }),
  ]);

  // Rejected students do not owe money, so a batch is settled as soon as no
  // request is pending and at least one student was actually paid.
  if (totalCount === 0 || pendingCount > 0 || paidCount === 0) {
    return { batch, finalized: false, pendingCount, paidCount, totalCount };
  }

  batch.status = 'paid';
  batch.financePaidAt = new Date();
  if (!batch.financePaymentConfirmedAt) batch.financePaymentConfirmedAt = new Date();
  batch.history.push({
    actor: userId,
    action: 'batch_paid',
    comment: `All ${paidCount} student payment(s) completed via TeleBirr.`,
    at: new Date(),
  });
  await batch.save();

  const actor = await User.findById(userId);
  await notifyAllOffices(batch, 'paid', actor);

  await AuditLog.create({
    user: userId,
    action: 'finalize_batch',
    targetId: batchId,
    targetType: 'PaymentBatch',
    meta: {
      reference: batch.financeReference || '',
      paid: String(paidCount),
    },
  });

  return { batch, finalized: true, pendingCount: 0, paidCount, totalCount };
}

exports.finalizeBatchIfComplete = finalizeBatchIfComplete;

// ============================================
// FINANCE GUIDED WORKFLOW (FUNCTIONS 1–10)
// ============================================
// The legacy finance endpoints above remain available. These functions model
// the ordered portal workflow so every step is recorded and can be resumed:
// review information → confirm amount → choose individual/batch → simulate
// TeleBirr → generate reference → confirm payments → set PAID → report.

async function financeScopeRequests(batch, { pendingOnly = false } = {}) {
  if (batch.financePaymentMode === 'individual' && batch.financeSelectedRequest) {
    const request = await Request.findById(batch.financeSelectedRequest)
      .populate('student', STUDENT_POPULATE)
      .populate('return', 'orgName orgAddress startDate endDate');
    return request ? [request] : [];
  }

  const filter = { batch: batch._id };
  if (pendingOnly) filter.status = 'pending_finance';

  return Request.find(filter)
    .populate('student', STUDENT_POPULATE)
    .populate('return', 'orgName orgAddress startDate endDate')
    .sort('createdAt');
}

function financeTransactionView(transaction, request) {
  const student = request?.student || transaction.student;
  return {
    transactionId: String(transaction._id),
    requestId: String(transaction.request?._id || transaction.request || request?._id),
    studentId: String(student?._id || ''),
    studentName: student?.fullName || 'Unknown student',
    institutionalId: student?.institutionalId || '',
    email: student?.email || '',
    program: student?.program || '',
    year: student?.year || null,
    amount: Number(transaction.amount) || 0,
    dailyRate: Number(transaction.dailyRate) || 0,
    durationDays: Number(transaction.durationDays) || 0,
    phone: transaction.phone,
    reference: transaction.reference,
    otp: transaction.status === 'otp_sent' ? transaction.otpCode : null,
    status: transaction.status,
    confirmedAt: transaction.confirmedAt || null,
  };
}

/**
 * Function 1 — view approved requests. The controller already returns batches
 * in `pending_finance`; this helper gives the guided portal a stable shape.
 */
exports.financeViewGuidedBatches = async () => {
  return exports.financeViewBatches();
};

/**
 * Function 2 — review and confirm payment information.
 */
exports.financeReviewBatch = async ({ userId, batchId, confirmed = true }) => {
  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'pending_finance') {
    throw new Error(`Batch is ${batch.status}. Payment information can only be reviewed from pending_finance.`);
  }

  if (confirmed === false) {
    batch.financeReviewConfirmedBy = null;
    batch.financeReviewConfirmedAt = null;
    batch.history.push({
      actor: userId,
      action: 'finance_review_reset',
      comment: 'Finance payment-information review reset',
      at: new Date(),
    });
    await batch.save();
    return batch;
  }

  const requests = await Request.find({ batch: batchId, status: 'pending_finance' })
    .populate('student', STUDENT_POPULATE);
  if (requests.length === 0) {
    // Every student may already have been paid individually while the batch
    // was never committed. Finalise it instead of trapping the officer on an
    // empty batch that they cannot review.
    const settlement = await finalizeBatchIfComplete({ userId, batchId });
    if (settlement.finalized || settlement.alreadyPaid) {
      return settlement.batch;
    }
    throw new Error('There are no pending payment requests in this batch.');
  }

  // Refresh every request from the student's registered account phone. Finance
  // must never pay a phone that is not the one in the student's registration.
  // A student without a phone is reported by the review UI and skipped by the
  // simulation; it must not block payment for the rest of the batch.
  for (const request of requests) {
    await syncRequestPhone(request);
  }

  const count = requests.length;
  batch.financeReviewConfirmedBy = userId;
  batch.financeReviewConfirmedAt = new Date();
  batch.history.push({
    actor: userId,
    action: 'finance_reviewed',
    comment: `Payment information reviewed for ${count} student(s)`,
    at: new Date(),
  });
  await batch.save();

  await AuditLog.create({
    user: userId,
    action: 'finance_review_payment_info',
    targetId: batchId,
    targetType: 'PaymentBatch',
    meta: { requestCount: String(count) },
  });

  return batch;
};

/**
 * Function 3 (read side) — calculate each student's amount and check it
 * against the request snapshot (daily rate × internship days).
 */
exports.financeCalculateBatchAmount = async ({ batchId }) => {
  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');
  if (!['pending_finance', 'paid'].includes(batch.status)) {
    throw new Error(`Batch is ${batch.status}. Amounts can only be calculated for Finance batches.`);
  }

  // While a batch is with Finance, only pending requests are payable, so the
  // calculated/confirmed total must match the pending scope used by function 3
  // and the simulation. Including already-paid students would make the
  // confirmed amount impossible to match after an individual payment.
  const filter = { batch: batchId };
  if (batch.status === 'pending_finance') filter.status = 'pending_finance';

  const requests = await Request.find(filter)
    .populate('student', STUDENT_POPULATE)
    .populate('return', 'orgName startDate endDate')
    .sort('createdAt');
  if (requests.length === 0) {
    throw new Error(
      batch.status === 'pending_finance'
        ? 'There are no pending payment requests in this batch.'
        : 'No payment requests are attached to this batch.'
    );
  }

  const settings = await PaymentSettings.findOne().sort('-updatedAt');
  const currentDailyRate = Number(settings?.dailyRate) || 100;

  const items = requests.map((request) => {
    const rate = Number(request.dailyRate) || currentDailyRate;
    const periodDays = internshipDays(request.return?.startDate, request.return?.endDate);
    const durationDays = Number(request.durationDays) || periodDays || 0;
    const calculationDays = periodDays || durationDays;
    const storedAmount = Number(request.amount) || 0;
    const recalculatedAmount = Math.round(rate * calculationDays * 100) / 100;

    return {
      requestId: String(request._id),
      studentId: String(request.student?._id || ''),
      studentName: request.student?.fullName || 'Unknown student',
      institutionalId: request.student?.institutionalId || '',
      phone: requestPhone(request),
      orgName: request.return?.orgName || '',
      startDate: request.return?.startDate || null,
      endDate: request.return?.endDate || null,
      dailyRate: rate,
      durationDays,
      calculationDays,
      storedAmount,
      recalculatedAmount,
      matched:
        storedAmount === recalculatedAmount &&
        (!periodDays || Number(request.durationDays) === periodDays),
      status: request.status,
    };
  });

  const totalAmount = items.reduce((sum, item) => sum + item.storedAmount, 0);
  const recalculatedTotal = items.reduce((sum, item) => sum + item.recalculatedAmount, 0);

  return {
    batchId: String(batch._id),
    batchName: batch.batchName,
    currentDailyRate,
    authorizedAmount: batch.authorizedAmount,
    items,
    summary: {
      studentCount: items.length,
      totalAmount,
      recalculatedTotal,
      difference: Math.round((totalAmount - recalculatedTotal) * 100) / 100,
      mismatchCount: items.filter(item => !item.matched).length,
      missingPhoneCount: items.filter(item => !item.phone).length,
    },
  };
};

/**
 * Function 3 (write side) — confirm the amount the Finance Office will pay.
 */
exports.financeConfirmBatchAmount = async ({ userId, batchId, confirmedAmount, note }) => {
  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'pending_finance') {
    throw new Error(`Batch is ${batch.status}. Payment amounts can only be confirmed from pending_finance.`);
  }
  if (!batch.financeReviewConfirmedAt) {
    throw new Error('Review and confirm the payment information (function 2) before confirming the amount.');
  }

  const requests = await Request.find({ batch: batchId, status: 'pending_finance' });
  if (requests.length === 0) throw new Error('No pending payment requests are attached to this batch.');

  const totalAmount = requests.reduce((sum, request) => sum + (Number(request.amount) || 0), 0);
  const confirmed = Number(confirmedAmount);

  if (confirmedAmount !== undefined && (!Number.isFinite(confirmed) || confirmed !== totalAmount)) {
    throw new Error(
      `The confirmed amount (${Number.isFinite(confirmed) ? confirmed : 0} ETB) does not match the request total (${totalAmount} ETB).`
    );
  }

  batch.financeConfirmedAmount = totalAmount;
  batch.financeAmountConfirmedBy = userId;
  batch.financeAmountConfirmedAt = new Date();
  batch.history.push({
    actor: userId,
    action: 'finance_amount_confirmed',
    comment: `Payment amount confirmed at ${totalAmount.toLocaleString()} ETB${note ? ` — ${note}` : ''}`,
    at: new Date(),
  });
  await batch.save();

  await AuditLog.create({
    user: userId,
    action: 'finance_confirm_amount',
    targetId: batchId,
    targetType: 'PaymentBatch',
    meta: { amount: String(totalAmount), note: note || '' },
  });

  return { batch, totalAmount };
};

/**
 * Function 4/5 — choose individual or batch payment. The actual TeleBirr
 * simulation happens in the next function so the whole sequence stays ordered.
 */
exports.financeSetPaymentMode = async ({ userId, batchId, mode, requestId }) => {
  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'pending_finance') {
    throw new Error(`Batch is ${batch.status}. A payment mode can only be chosen from pending_finance.`);
  }
  if (!batch.financeAmountConfirmedAt) {
    throw new Error('Confirm the payment amount (function 3) before choosing a payment mode.');
  }
  if (!['individual', 'batch'].includes(mode)) {
    throw new Error('Choose either individual or batch payment.');
  }

  if (batch.financeSimulatedAt) {
    // A completed confirmation cycle can be followed by another individual
    // student or by the remaining students in a partial batch. Any attempt to
    // switch modes while an OTP is still awaiting confirmation would discard a
    // live TeleBirr payment, so block only that case.
    const currentRequests = await financeScopeRequests(batch);
    const currentIds = currentRequests.map(request => request._id);
    const unconfirmedCount = currentIds.length
      ? await TeleBirrTransaction.countDocuments({
          request: { $in: currentIds },
          status: 'otp_sent',
        })
      : 0;
    const paidInScope = currentIds.length
      ? await Request.countDocuments({ _id: { $in: currentIds }, status: 'paid' })
      : 0;

    if (!batch.financePaymentConfirmedAt || unconfirmedCount > 0 || paidInScope === 0) {
      throw new Error(
        'TeleBirr has already been simulated for this payment. Finish the confirmation step before starting another student.'
      );
    }

    batch.financePaymentMode = null;
    batch.financeSelectedRequest = null;
    batch.financeModeSelectedAt = null;
    batch.financeSimulatedBy = null;
    batch.financeSimulatedAt = null;
    batch.financeReference = null;
    batch.financePaymentConfirmedBy = null;
    batch.financePaymentConfirmedAt = null;
    batch.history.push({
      actor: userId,
      action: 'finance_payment_cycle_reset',
      comment: 'Ready for the next TeleBirr payment cycle',
      at: new Date(),
    });
  }

  let selected = null;
  if (mode === 'individual') {
    if (!requestId) throw new Error('Choose the student whose payment should be processed individually.');
    selected = await Request.findOne({
      _id: requestId,
      batch: batchId,
      status: 'pending_finance',
    }).populate('student', STUDENT_POPULATE);

    if (!selected) throw new Error('The selected payment request is not pending Finance payment.');
    const phone = await syncRequestPhone(selected);
    if (!phone) {
      throw new Error('The selected student does not have a registered phone number for TeleBirr.');
    }
  } else {
    const pending = await Request.find({ batch: batchId, status: 'pending_finance' })
      .populate('student', STUDENT_POPULATE);
    if (pending.length === 0) throw new Error('There are no pending students to pay in this batch.');
    // Students without a phone are skipped with a clear per-student reason in
    // the simulation step; they must not stop the rest of the batch from being
    // paid. The officer can fix the phone and pay them individually afterwards.
  }

  batch.financePaymentMode = mode;
  batch.financeSelectedRequest = selected?._id || null;
  batch.financeModeSelectedAt = new Date();
  batch.history.push({
    actor: userId,
    action: 'finance_mode_selected',
    comment: mode === 'individual'
      ? `Individual TeleBirr payment selected for ${selected.student?.fullName || 'one student'}`
      : 'Batch TeleBirr payment selected for all pending students',
    at: new Date(),
  });
  await batch.save();

  await AuditLog.create({
    user: userId,
    action: 'finance_select_payment_mode',
    targetId: batchId,
    targetType: 'PaymentBatch',
    meta: { mode, requestId: selected ? String(selected._id) : '' },
  });

  return batch;
};

/**
 * Function 6 — simulate TeleBirr for the selected individual/batch scope.
 * Creates (or reuses) one transaction + OTP per student. It does NOT mark the
 * requests paid; that happens after the OTP confirmation (function 8).
 */
exports.financeSimulateBatchPayment = async ({ userId, batchId }) => {
  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'pending_finance') {
    throw new Error(`Batch is ${batch.status}. TeleBirr can only be simulated from pending_finance.`);
  }
  if (!batch.financeAmountConfirmedAt) {
    throw new Error('Confirm the payment amount (function 3) before simulating TeleBirr.');
  }
  if (!batch.financePaymentMode) {
    throw new Error('Choose individual or batch payment (functions 4/5) before simulating TeleBirr.');
  }

  const requests = await financeScopeRequests(batch, { pendingOnly: true });
  if (requests.length === 0) {
    throw new Error('There are no pending students in the selected payment scope.');
  }

  const transactions = [];
  const errors = [];

  for (const request of requests) {
    const phone = await syncRequestPhone(request);
    if (!phone) {
      errors.push({
        requestId: String(request._id),
        studentName: request.student?.fullName || 'Unknown student',
        reason: 'No registered phone number for TeleBirr',
      });
      continue;
    }

    try {
      if (!request.student?._id) {
        errors.push({
          requestId: String(request._id),
          studentName: 'Unknown student (account removed)',
          reason: 'Student account no longer exists',
        });
        continue;
      }

      let transaction = await TeleBirr.getSimulationTransaction(request._id);

      if (!transaction || transaction.status === 'failed') {
        await TeleBirr.initiatePayment({
          requestId: request._id,
          studentId: request.student._id,
          phone,
          amount: Number(request.amount) || 0,
          dailyRate: Number(request.dailyRate) || 0,
          durationDays: Number(request.durationDays) || 0,
          processedBy: userId,
        });
        transaction = await TeleBirr.getSimulationTransaction(request._id);
      }

      if (!transaction) {
        throw new Error('TeleBirr transaction could not be created');
      }

      // A request may have been simulated before the student corrected their
      // account phone. The registered number wins until the OTP is confirmed.
      if (transaction.status === 'otp_sent' && transaction.phone !== phone) {
        transaction.phone = phone;
        await transaction.save();
      }

      transactions.push(financeTransactionView(transaction, request));
    } catch (error) {
      errors.push({
        requestId: String(request._id),
        studentName: request.student?.fullName || 'Unknown student',
        reason: error.message,
      });
    }
  }

  if (transactions.length === 0) {
    throw new Error(errors[0]?.reason || 'TeleBirr simulation failed for every student.');
  }

  batch.financeSimulatedBy = userId;
  batch.financeSimulatedAt = batch.financeSimulatedAt || new Date();
  batch.history.push({
    actor: userId,
    action: 'finance_simulated',
    comment: `TeleBirr simulated for ${transactions.length} student(s)`,
    at: new Date(),
  });
  await batch.save();

  await AuditLog.create({
    user: userId,
    action: 'finance_simulate_telebirr',
    targetId: batchId,
    targetType: 'PaymentBatch',
    meta: {
      mode: batch.financePaymentMode,
      simulated: String(transactions.length),
      failed: String(errors.length),
    },
  });

  return {
    batch,
    mode: batch.financePaymentMode,
    transactions,
    errors,
    simulatedCount: transactions.length,
  };
};

/**
 * Function 7 — record a settlement reference for the simulated payment scope.
 * Each student transaction already has a TeleBirr reference; this is the
 * Finance Office's batch/settlement reference used in reports and audit logs.
 */
exports.financeGeneratePaymentReference = async ({ userId, batchId }) => {
  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'pending_finance' && batch.status !== 'paid') {
    throw new Error(`Batch is ${batch.status}. A payment reference can only be generated for Finance batches.`);
  }
  if (!batch.financeSimulatedAt) {
    throw new Error('Simulate TeleBirr (function 6) before generating the payment reference.');
  }

  if (!batch.financeReference) {
    batch.financeReference = TeleBirr.generateReference();
    batch.history.push({
      actor: userId,
      action: 'finance_reference_generated',
      comment: `Payment reference generated: ${batch.financeReference}`,
      at: new Date(),
    });
    await batch.save();

    await AuditLog.create({
      user: userId,
      action: 'finance_generate_reference',
      targetId: batchId,
      targetType: 'PaymentBatch',
      meta: { reference: batch.financeReference, mode: batch.financePaymentMode },
    });
  }

  return batch;
};

/**
 * Function 8 — confirm the simulated TeleBirr payments. This is the only place
 * where the student transaction/request/return become paid and the student is
 * notified. The batch itself is finalised in function 9.
 */
exports.financeConfirmBatchPayments = async ({ userId, batchId, otpByTransaction }) => {
  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'pending_finance') {
    throw new Error(`Batch is ${batch.status}. Payments can only be confirmed from pending_finance.`);
  }
  if (!batch.financeSimulatedAt) {
    throw new Error('Simulate TeleBirr (function 6) before confirming payments.');
  }
  if (!batch.financeReference) {
    throw new Error('Generate a payment reference (function 7) before confirming payments.');
  }

  const requests = await financeScopeRequests(batch);
  if (requests.length === 0) throw new Error('No payment requests found in the selected payment scope.');

  const requestIds = requests.map(request => request._id);
  const transactions = await TeleBirrTransaction.find({ request: { $in: requestIds } }).select('+otpCode');
  if (transactions.length === 0) {
    throw new Error('No TeleBirr transactions were found. Run the simulation again.');
  }

  const requestById = new Map(requests.map(request => [String(request._id), request]));
  const results = [];

  for (const transaction of transactions) {
    const request = requestById.get(String(transaction.request));
    const studentName = request?.student?.fullName || 'Unknown student';

    if (transaction.status === 'confirmed') {
      results.push({
        requestId: String(transaction.request),
        transactionId: String(transaction._id),
        studentName,
        reference: transaction.reference,
        amount: transaction.amount,
        success: true,
        alreadyConfirmed: true,
      });
      continue;
    }

    if (transaction.status !== 'otp_sent') {
      results.push({
        requestId: String(transaction.request),
        transactionId: String(transaction._id),
        studentName,
        success: false,
        reason: `Transaction is ${transaction.status}, not awaiting OTP confirmation`,
      });
      continue;
    }

    const otp = otpByTransaction?.[String(transaction._id)]
      || otpByTransaction?.[String(transaction.request)]
      || transaction.otpCode;

    if (!otp) {
      results.push({
        requestId: String(transaction.request),
        transactionId: String(transaction._id),
        studentName,
        success: false,
        reason: 'No OTP was provided',
      });
      continue;
    }

    try {
      const confirmed = await TeleBirr.confirmPayment({
        txnId: transaction._id,
        otpCode: String(otp),
        userId,
      });
      results.push({
        requestId: String(transaction.request),
        transactionId: String(transaction._id),
        studentName,
        reference: confirmed.reference,
        amount: confirmed.amount,
        success: true,
        alreadyConfirmed: false,
      });
    } catch (error) {
      results.push({
        requestId: String(transaction.request),
        transactionId: String(transaction._id),
        studentName,
        success: false,
        reason: error.message,
      });
    }
  }

  const successCount = results.filter(result => result.success).length;
  if (successCount === 0) {
    throw new Error(results[0]?.reason || 'No TeleBirr payments could be confirmed.');
  }

  batch.financePaymentConfirmedBy = userId;
  batch.financePaymentConfirmedAt = new Date();
  batch.history.push({
    actor: userId,
    action: 'finance_payments_confirmed',
    comment: `TeleBirr confirmation received for ${successCount} of ${results.length} student(s)`,
    at: new Date(),
  });
  await batch.save();

  await AuditLog.create({
    user: userId,
    action: 'finance_confirm_telebirr_payments',
    targetId: batchId,
    targetType: 'PaymentBatch',
    meta: {
      reference: batch.financeReference,
      confirmed: String(successCount),
      total: String(results.length),
    },
  });

  const updated = await Batch.findById(batchId);
  return {
    batch: updated,
    results,
    successCount,
    totalCount: results.length,
    allPaid: (await Request.countDocuments({ batch: batchId, status: 'pending_finance' })) === 0,
  };
};

/**
 * Function 9 — set the request/batch status to PAID. Individual requests are
 * marked paid by TeleBirr confirmation; this function finalises the batch once
 * every student has been paid and notifies the other offices.
 */
exports.financeMarkBatchPaid = async ({ userId, batchId }) => {
  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'pending_finance' && batch.status !== 'paid') {
    throw new Error(`Batch is ${batch.status}. PAID status can only be set for Finance batches.`);
  }
  const [pendingCount, paidCount, totalCount] = await Promise.all([
    Request.countDocuments({ batch: batchId, status: 'pending_finance' }),
    Request.countDocuments({ batch: batchId, status: 'paid' }),
    Request.countDocuments({ batch: batchId }),
  ]);

  // A batch whose requests were all confirmed by TeleBirr (for example from
  // the Individual Payment page) is already settled; finalising it must not be
  // blocked just because the guided confirmation flag was never recorded.
  if (!batch.financePaymentConfirmedAt && pendingCount > 0) {
    throw new Error('Confirm the TeleBirr payment (function 8) before marking it PAID.');
  }
  if (totalCount === 0) {
    throw new Error('This batch has no payment requests to finalise.');
  }

  if (pendingCount > 0) {
    batch.history.push({
      actor: userId,
      action: 'finance_partial_payment',
      comment: `${paidCount} student(s) paid; ${pendingCount} still awaiting payment`,
      at: new Date(),
    });
    await batch.save();

    return { batch, pendingCount, paidCount, allPaid: false, partial: true };
  }

  if (batch.status !== 'paid') {
    batch.status = 'paid';
    batch.financePaidAt = new Date();
    if (!batch.financePaymentConfirmedAt) batch.financePaymentConfirmedAt = new Date();
    batch.history.push({
      actor: userId,
      action: 'batch_paid',
      comment: `All ${paidCount} student payment(s) completed via TeleBirr. Reference: ${batch.financeReference || '—'}`,
      at: new Date(),
    });
    await batch.save();

    const actor = await User.findById(userId);
    await notifyAllOffices(batch, 'paid', actor);

    await AuditLog.create({
      user: userId,
      action: 'finance_mark_batch_paid',
      targetId: batchId,
      targetType: 'PaymentBatch',
      meta: {
        reference: batch.financeReference || '',
        paidCount: String(paidCount),
        amount: String(batch.financeConfirmedAmount || 0),
      },
    });
  }

  return { batch, pendingCount, paidCount, allPaid: true, partial: false };
};

/**
 * Function 10 — mark that the Finance report/history was generated for this batch.
 */
exports.financeMarkReportGenerated = async ({ userId, batchId }) => {
  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');
  if (!['pending_finance', 'paid'].includes(batch.status)) {
    throw new Error(`Batch is ${batch.status}. Reports can only be generated for Finance batches.`);
  }

  batch.financeReportGeneratedAt = new Date();
  batch.history.push({
    actor: userId,
    action: 'finance_report_generated',
    comment: 'Payment report generated by Finance',
    at: new Date(),
  });
  await batch.save();

  await AuditLog.create({
    user: userId,
    action: 'finance_generate_report',
    targetId: batchId,
    targetType: 'PaymentBatch',
    meta: { status: batch.status },
  });

  return batch;
};

/**
 * Session view used by steps 6–10. Includes the simulated OTP so the Finance
 * portal can display the academic simulation; never include this in production.
 */
exports.financeGetPaymentSession = async ({ batchId }) => {
  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');

  const requests = await financeScopeRequests(batch);
  const transactions = [];

  for (const request of requests) {
    const transaction = await TeleBirr.getSimulationTransaction(request._id);
    if (transaction) transactions.push(financeTransactionView(transaction, request));
  }

  return {
    batchId: String(batch._id),
    mode: batch.financePaymentMode || null,
    selectedRequest: batch.financeSelectedRequest ? String(batch.financeSelectedRequest) : null,
    simulatedAt: batch.financeSimulatedAt || null,
    reference: batch.financeReference || null,
    paymentConfirmedAt: batch.financePaymentConfirmedAt || null,
    paidAt: batch.financePaidAt || null,
    transactions,
  };
};

/**
 * Finance views payment history
 */
exports.financeViewPaymentHistory = async ({ filters = {} } = {}) => {
  const query = {};
  
  if (filters.status) query.status = filters.status;
  if (filters.batch) query.batch = filters.batch;
  
  return await Request.find(query)
    .populate('student', STUDENT_POPULATE)
    .populate('batch', 'batchName semester academicYear status')
    .populate('return', 'orgName startDate endDate')
    .sort('-createdAt');
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Notify all users with a specific role
 */
async function notifyRole(role, batch, message, actor, comment) {
  const users = await User.find({ role, accountStatus: 'active' });
  
  if (users.length === 0) return;

  // `actor` is usually a userId (ObjectId) — resolve it so the notification
  // shows WHO acted instead of always "System".
  let actorDoc = actor;
  if (actorDoc && !actorDoc.fullName) {
    actorDoc = await User.findById(actorDoc).select('fullName role');
  }

  const fullMessage = [
    message,
    comment ? `Review note: ${comment}` : '',
    `Batch: ${batch.batchName}`,
    `Students: ${batch.students.length}`,
    `Forwarded by: ${actorDoc?.fullName || 'System'} (${actorDoc?.role || 'system'})`,
    `Time: ${new Date().toLocaleString()}`,
  ].filter(Boolean).join('\n\n');

  const needsAction = /reject|return|correct|missing|resubmit/i.test(message);

  // Repeated returns for the same batch stay in one conversation. Resolve the
  // previous open request from this actor's role before sending the new one,
  // so the receiving office sees exactly one item waiting for correction.
  let existing = null;
  if (needsAction) {
    const query = {
      batch: batch._id,
      recipientRole: role,
      category: 'workflow',
      actionRequired: true,
      resolvedAt: null,
    };
    if (actorDoc?.role) query.senderRole = actorDoc.role;
    existing = await Notification.findOne(query).sort('-createdAt').select('threadId messageKey');
    if (existing) {
      await markResolved({
        messageKey: existing.messageKey,
        threadId: existing.threadId,
        resolvedBy: actorDoc?._id,
      });
    }
  }

  await deliver({
    sender: actorDoc,
    recipients: users,
    subject: `Batch ${batch.batchName}: ${message}`,
    message: fullMessage,
    category: 'workflow',
    type: 'workflow',
    link: portalLinkFor(role),
    batch: batch._id,
    actionRequired: needsAction,
    threadId: existing?.threadId,
    replyTo: existing?.messageKey,
  });
}

/**
 * Every portal page that exists for a role — used as the notification link.
 * The old `/batch/:id` link matched no route, so opening a workflow
 * notification threw the user back to the home page.
 */
function portalLinkFor(role) {
  const links = {
    student:      '/student/status',
    cs_dept:      '/cs-dept/forward',
    college:      '/college/pending',
    academic_vp:  '/academic-vp/approved',
    admin_vp:     '/admin-vp/endorsed',
    finance:      '/finance/batch',
    admin:        '/admin',
  };
  return links[role] || '/';
}

/**
 * Notify all offices about batch status
 */
async function notifyAllOffices(batch, status, actor) {
  const roles = ['cs_dept', 'college', 'academic_vp', 'admin_vp', 'finance'];
  const users = await User.find({ role: { $in: roles }, accountStatus: 'active' });

  if (users.length === 0) return;

  const statusMessages = {
    paid: '✅ Payment COMPLETED via TeleBirr',
    rejected: '❌ Payment REJECTED',
  };

  const message = [
    statusMessages[status] || `Batch status changed to: ${status}`,
    `Batch: ${batch.batchName}`,
    `Completed by: ${actor?.fullName || 'System'} (${actor?.role || 'system'})`,
    `Time: ${new Date().toLocaleString()}`,
  ].join('\n');

  await deliver({
    sender: actor,
    recipients: users,
    subject: `Batch ${batch.batchName}: payment ${status}`,
    message,
    category: 'workflow',
    type: 'payment',
    batch: batch._id,
  });
}

/**
 * Notify students about batch status
 */
async function notifyStudents(batch, status, actor, comment) {
  const returns = await Return.find({ student: { $in: batch.students } });
  
  const messages = {
    rejected: `❌ Your internship payment request was REJECTED. Reason: ${comment || 'No reason provided'}`,
    paid: '✅ Your internship payment has been COMPLETED via TeleBirr',
    returned_correction: `↩ Your internship payment request was sent back for correction. Reason: ${comment || 'No reason provided'}\n\nThe reviewing office is waiting for corrected information — no action is required from you unless your department contacts you.`,
  };

  const baseMessage = {
    pending_college: '📋 Your request forwarded to College Office for review',
    pending_academic_vp: '📋 Your request forwarded to Academic VP for academic eligibility check',
    pending_admin_vp: '📋 Your request forwarded to Admin VP for authorization',
    pending_finance: '📋 Your payment is being processed by Finance',
  };

  // `let`: this used to be a `const` and every `+=` threw
  // "Assignment to constant variable", which made REJECT actions report a
  // failure to the user even though the database had already changed.
  let message = messages[status] || baseMessage[status] || `Status: ${status}`;

  let actorDoc = actor;
  if (actorDoc && !actorDoc.fullName) {
    actorDoc = await User.findById(actorDoc).select('fullName role');
  }

  if (actorDoc) {
    message += `\n\nForwarded/acted by: ${actorDoc.fullName || 'System'} (${actorDoc.role || 'system'})`;
  }

  // One thread per student: a batch-wide thread would let every student in the
  // batch see another student's reply.
  for (const ret of returns) {
    await deliver({
      sender: actorDoc,
      recipients: [ret.student],
      subject: `Batch ${batch.batchName}: ${String(status).replace(/_/g, ' ')}`,
      message,
      category: 'workflow',
      type: 'status',
      link: '/student/status',
      batch: batch._id,
      student: ret.student,
    });
  }
}
