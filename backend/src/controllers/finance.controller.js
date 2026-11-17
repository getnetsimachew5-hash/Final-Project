const { STUDENT_POPULATE } = require('../utils/studentFields');
const Batch            = require('../models/PaymentBatch');
const Request          = require('../models/PaymentRequest');
const Return           = require('../models/InternshipReturn');
const User             = require('../models/User');
const Settings         = require('../models/PaymentSettings');
const TeleBirrTransaction = require('../models/TeleBirrTransaction');
const TeleBirr         = require('../services/telebirr.service');
const workflow         = require('../services/workflow.service');
const { syncRequestPhone } = require('../utils/paymentPhone');

/**
 * ============================================
 * FINANCE ACTOR CONTROLLER
 * ============================================
 * The Finance Office processes payments via TeleBirr.
 * Functions:
 * - Register/login
 * - View approved payment requests
 * - Review payment information
 * - Calculate/confirm payment amount
 * - Process individual payment
 * - Process batch payment
 * - Simulate TeleBirr payment
 * - Generate payment reference
 * - Confirm successful payment
 * - Change request status to Paid
 * - Generate payment reports
 * - Maintain payment history
 */

// ============================================
// VIEW BATCHES & REQUESTS
// ============================================

/**
 * Get all batches pending Finance payment
 * These are batches authorized by the Administrative VP
 */
exports.viewBatches = async (req, res) => {
  try {
    const batches = await Batch.find({ status: 'pending_finance' })
      .populate('students', STUDENT_POPULATE)
      .populate('createdBy', 'fullName')
      .populate('history.actor', 'fullName role')
      .sort('-createdAt');

    const batchesWithRequests = await Promise.all(
      batches.map(async (batch) => {
        const requests = await Request.find({ batch: batch._id, status: 'pending_finance' })
          .populate('student', STUDENT_POPULATE)
          .populate('return', 'orgName startDate endDate');

        return {
          ...batch.toObject(),
          requests,
          // The payable scope is the pending students, not every student who
          // was ever added to the batch (a batch may be partially paid).
          studentCount: requests.length,
          batchStudentCount: batch.students.length,
          totalAmount: requests.reduce((sum, r) => sum + r.amount, 0),
        };
      })
    );

    res.json({
      batches: batchesWithRequests,
      pendingCount: batchesWithRequests.length,
      totalPendingAmount: batchesWithRequests.reduce((sum, b) => sum + b.totalAmount, 0),
    });
  } catch (error) {
    console.error('View batches error:', error);
    res.status(500).json({ message: 'Failed to load batches' });
  }
};

/**
 * Payment overview for the Finance dashboard.
 *
 * `viewBatches` intentionally returns only work still waiting for payment.
 * The dashboard also needs a clear record of which students inside each
 * batch are already paid and which are still pending, so this endpoint
 * returns both active and completed Finance batches with every request.
 */
exports.overview = async (req, res) => {
  try {
    const batches = await Batch.find({ status: { $in: ['pending_finance', 'paid'] } })
      .populate('students', STUDENT_POPULATE)
      .populate('createdBy', 'fullName')
      .sort('-updatedAt')
      .limit(30);

    const enriched = await Promise.all(batches.map(async (batch) => {
      const requests = await Request.find({ batch: batch._id })
        .populate('student', STUDENT_POPULATE)
        .populate('return', 'orgName startDate endDate')
        .sort('student.fullName');

      const paid = requests.filter(request => request.status === 'paid');
      const pending = requests.filter(request => request.status === 'pending_finance');
      const paidAmount = paid.reduce((sum, request) => sum + (Number(request.amount) || 0), 0);
      const pendingAmount = pending.reduce((sum, request) => sum + (Number(request.amount) || 0), 0);

      return {
        ...batch.toObject(),
        requests,
        paidRequests: paid,
        pendingRequests: pending,
        paidCount: paid.length,
        pendingCount: pending.length,
        totalAmount: paidAmount + pendingAmount,
        paidAmount,
        pendingAmount,
      };
    }));

    res.json({
      batches: enriched,
      pendingBatches: enriched.filter(batch => batch.status === 'pending_finance').length,
      paidBatches: enriched.filter(batch => batch.status === 'paid').length,
      totalPaid: enriched.reduce((sum, batch) => sum + batch.paidAmount, 0),
      totalPending: enriched.reduce((sum, batch) => sum + batch.pendingAmount, 0),
    });
  } catch (error) {
    console.error('Finance overview error:', error);
    res.status(500).json({ message: 'Failed to load the payment overview' });
  }
};

/**
 * Get batch payment details
 */
exports.getBatchDetails = async (req, res) => {
  try {
    const batch = await Batch.findById(req.params.id)
      .populate('students', STUDENT_POPULATE)
      .populate('createdBy', 'fullName')
      .populate('history.actor', 'fullName role');

    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    if (batch.status !== 'pending_finance') {
      return res.status(400).json({
        message: `Batch is ${batch.status}. Can only process pending_finance batches.`
      });
    }

    const requests = await Request.find({ batch: batch._id, status: 'pending_finance' })
      .populate('student', STUDENT_POPULATE)
      .populate('return', 'orgName startDate endDate supervisorName');

    const totalAmount = requests.reduce((sum, r) => sum + (r.amount || 0), 0);

    res.json({
      batch,
      requests,
      summary: {
        studentCount: requests.length,
        totalAmount,
        averageAmount: requests.length > 0 ? Math.round(totalAmount / requests.length * 100) / 100 : 0,
      },
    });
  } catch (error) {
    console.error('Get batch details error:', error);
    res.status(500).json({ message: 'Failed to load batch details' });
  }
};

/**
 * Get all payment requests
 */
exports.viewRequests = async (req, res) => {
  try {
    const { status, batch, search } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (batch) filter.batch = batch;
    if (search) {
      filter.$or = [
        { 'student.fullName': { $regex: search, $options: 'i' } },
        { 'student.institutionalId': { $regex: search, $options: 'i' } },
      ];
    }

    const requests = await Request.find(filter)
      .populate('student', STUDENT_POPULATE)
      .populate('batch', 'batchName semester academicYear status')
      .populate('return', 'orgName startDate endDate')
      .sort('-createdAt');

    res.json({ requests });
  } catch (error) {
    console.error('View requests error:', error);
    res.status(500).json({ message: 'Failed to load requests' });
  }
};

/**
 * Get single payment request details
 */
exports.getRequestDetails = async (req, res) => {
  try {
    const request = await Request.findById(req.params.id)
      .populate('student', STUDENT_POPULATE)
      .populate('batch', 'batchName semester academicYear status')
      .populate('return', 'orgName orgAddress startDate endDate supervisorName supervisorPhone');

    if (!request) {
      return res.status(404).json({ message: 'Payment request not found' });
    }

    // Get TeleBirr transaction if exists
    const transaction = await TeleBirr.getTransactionByRequest(request._id);

    res.json({
      request,
      transaction,
      paymentStatus: transaction ? await TeleBirr.checkPaymentStatus(request._id) : null,
    });
  } catch (error) {
    console.error('Get request details error:', error);
    res.status(500).json({ message: 'Failed to load request details' });
  }
};

// ============================================
// GUIDED 10-STEP WORKFLOW (FUNCTIONS 1–10)
// ============================================

/**
 * Function 2 — review and confirm the payment information.
 */
exports.reviewBatch = async (req, res) => {
  try {
    const batch = await workflow.financeReviewBatch({
      userId: req.user._id,
      batchId: req.params.id,
      confirmed: req.body?.confirmed !== false,
    });
    res.json({ message: 'Payment information reviewed and confirmed.', batch });
  } catch (error) {
    console.error('Finance review batch error:', error);
    res.status(400).json({ message: error.message });
  }
};

/**
 * Function 3 — calculate amounts and compare them with the request snapshot.
 */
exports.getBatchAmount = async (req, res) => {
  try {
    const calculation = await workflow.financeCalculateBatchAmount({
      batchId: req.params.id,
    });
    res.json(calculation);
  } catch (error) {
    console.error('Finance batch amount error:', error);
    res.status(400).json({ message: error.message });
  }
};

/**
 * Function 3 — confirm the calculated amount before payment.
 */
exports.confirmBatchAmount = async (req, res) => {
  try {
    const { batch, totalAmount } = await workflow.financeConfirmBatchAmount({
      userId: req.user._id,
      batchId: req.params.id,
      confirmedAmount: req.body?.confirmedAmount,
      note: req.body?.note,
    });
    res.json({
      message: `Payment amount confirmed — ${totalAmount.toLocaleString()} ETB.`,
      batch,
      totalAmount,
    });
  } catch (error) {
    console.error('Finance confirm amount error:', error);
    res.status(400).json({ message: error.message });
  }
};

/**
 * Functions 4/5 — choose individual or batch payment.
 */
exports.setPaymentMode = async (req, res) => {
  try {
    const batch = await workflow.financeSetPaymentMode({
      userId: req.user._id,
      batchId: req.params.id,
      mode: req.body?.mode,
      requestId: req.body?.requestId,
    });
    res.json({
      message: batch.financePaymentMode === 'individual'
        ? 'Individual TeleBirr payment selected.'
        : 'Batch TeleBirr payment selected.',
      batch,
    });
  } catch (error) {
    console.error('Finance payment mode error:', error);
    res.status(400).json({ message: error.message });
  }
};

/**
 * Function 6 — simulate TeleBirr and generate an OTP per selected student.
 */
exports.simulateBatchPayment = async (req, res) => {
  try {
    const result = await workflow.financeSimulateBatchPayment({
      userId: req.user._id,
      batchId: req.params.id,
    });
    res.json({
      message: `TeleBirr simulated for ${result.simulatedCount} student(s).`,
      ...result,
    });
  } catch (error) {
    console.error('Finance TeleBirr simulation error:', error);
    res.status(400).json({ message: error.message });
  }
};

/**
 * Function 7 — generate the Finance settlement reference.
 */
exports.generatePaymentReference = async (req, res) => {
  try {
    const batch = await workflow.financeGeneratePaymentReference({
      userId: req.user._id,
      batchId: req.params.id,
    });
    res.json({
      message: batch.financeReference
        ? `Payment reference ready: ${batch.financeReference}`
        : 'Payment reference already generated.',
      batch,
      reference: batch.financeReference,
    });
  } catch (error) {
    console.error('Finance reference error:', error);
    res.status(400).json({ message: error.message });
  }
};

/**
 * Function 8 — confirm the TeleBirr payments with their OTPs.
 */
exports.confirmBatchPayment = async (req, res) => {
  try {
    const result = await workflow.financeConfirmBatchPayments({
      userId: req.user._id,
      batchId: req.params.id,
      otpByTransaction: req.body?.otpByTransaction || {},
    });
    res.json({
      message: `Payment confirmed for ${result.successCount} of ${result.totalCount} student(s).`,
      ...result,
    });
  } catch (error) {
    console.error('Finance confirm batch payment error:', error);
    res.status(400).json({ message: error.message });
  }
};

/**
 * Function 9 — mark the batch PAID once every student payment is confirmed.
 */
exports.markBatchPaid = async (req, res) => {
  try {
    const result = await workflow.financeMarkBatchPaid({
      userId: req.user._id,
      batchId: req.params.id,
    });

    res.json({
      message: result.allPaid
        ? 'Batch status changed to PAID. All students were notified.'
        : `${result.paidCount} student(s) paid; ${result.pendingCount} still awaiting payment.`,
      ...result,
    });
  } catch (error) {
    console.error('Finance mark paid error:', error);
    res.status(400).json({ message: error.message });
  }
};

/**
 * Commit a batch whose students were all paid outside the guided workflow
 * (for example through the Individual Payment page). Safe to call repeatedly.
 */
exports.finalizeBatch = async (req, res) => {
  try {
    const result = await workflow.finalizeBatchIfComplete({
      userId: req.user._id,
      batchId: req.params.id,
    });

    if (!result.batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    res.json({
      message: result.finalized
        ? 'Every student was already paid. The batch is now marked PAID.'
        : result.alreadyPaid
          ? 'This batch is already PAID.'
          : 'Some students are still awaiting payment.',
      batch: result.batch,
      finalized: Boolean(result.finalized),
      alreadyPaid: Boolean(result.alreadyPaid),
      pendingCount: result.pendingCount || 0,
    });
  } catch (error) {
    console.error('Finalize batch error:', error);
    res.status(400).json({ message: error.message });
  }
};

/**
 * Function 10 — record that a payment report was generated.
 */
exports.markReportGenerated = async (req, res) => {
  try {
    const batch = await workflow.financeMarkReportGenerated({
      userId: req.user._id,
      batchId: req.params.id,
    });
    res.json({ message: 'Payment report generated and recorded in history.', batch });
  } catch (error) {
    console.error('Finance report error:', error);
    res.status(400).json({ message: error.message });
  }
};

/**
 * Payment session for steps 6–10 (simulated OTPs + generated references).
 */
exports.getPaymentSession = async (req, res) => {
  try {
    const session = await workflow.financeGetPaymentSession({
      batchId: req.params.id,
    });
    res.json(session);
  } catch (error) {
    console.error('Finance payment session error:', error);
    res.status(400).json({ message: error.message });
  }
};

/**
 * Full batch trail for the final guided step. Works after the batch is PAID.
 */
exports.getBatchHistory = async (req, res) => {
  try {
    const batch = await Batch.findById(req.params.id)
      .populate('students', STUDENT_POPULATE)
      .populate('createdBy', 'fullName role')
      .populate('history.actor', 'fullName role');

    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    const requests = await Request.find({ batch: batch._id })
      .populate('student', STUDENT_POPULATE)
      .populate('return', 'orgName orgAddress startDate endDate supervisorName');

    const transactions = await TeleBirrTransaction.find({
      request: { $in: requests.map(request => request._id) },
    })
      .populate('student', 'fullName institutionalId phone')
      .populate('request', 'amount status')
      .sort('-createdAt');

    const paidCount = requests.filter(request => request.status === 'paid').length;
    const totalAmount = requests.reduce((sum, request) => sum + (Number(request.amount) || 0), 0);
    const paidAmount = requests
      .filter(request => request.status === 'paid')
      .reduce((sum, request) => sum + (Number(request.amount) || 0), 0);

    res.json({
      batch,
      requests,
      transactions,
      summary: {
        studentCount: requests.length,
        paidCount,
        pendingCount: requests.length - paidCount,
        totalAmount,
        paidAmount,
        authorizedAmount: batch.authorizedAmount,
        confirmedAmount: batch.financeConfirmedAmount,
        mode: batch.financePaymentMode || null,
        reference: batch.financeReference || null,
        reportGeneratedAt: batch.financeReportGeneratedAt || null,
      },
    });
  } catch (error) {
    console.error('Finance batch history error:', error);
    res.status(500).json({ message: 'Failed to load payment history' });
  }
};

// ============================================
// PAYMENT CALCULATION
// ============================================

/**
 * Calculate payment amount for a request
 * Amount = Daily Rate Ã— Duration Days
 */
exports.calculateAmount = async (req, res) => {
  try {
    const request = await Request.findById(req.params.id)
      .populate('student', 'fullName institutionalId phone')
      .populate('return');

    if (!request) {
      return res.status(404).json({ message: 'Payment request not found' });
    }

    const calculation = await TeleBirr.computeAmount(request.return);
    const phone = await syncRequestPhone(request);

    res.json({
      requestId: request._id,
      student: request.student,
      calculation,
      phone,
    });
  } catch (error) {
    console.error('Calculate amount error:', error);
    res.status(500).json({ message: 'Failed to calculate amount' });
  }
};

// ============================================
// PAYMENT PROCESSING
// ============================================

/**
 * Process individual payment via TeleBirr
 */
exports.processPayment = async (req, res) => {
  try {
    const result = await workflow.financeProcessPayment({
      userId: req.user._id,
      requestId: req.params.id,
    });

    const t = result.transaction;
    res.json({
      message: t.alreadyPaid
        ? 'This payment was already confirmed. The student has received the balance.'
        : t.reissued
          ? `A new OTP was generated for ${result.request.amount} ETB. Enter the code to confirm the payment.`
          : `Payment of ${result.request.amount} ETB ${t.reused ? 'is awaiting the existing OTP' : 'initiated. OTP sent to student\'s phone'}.`,
      alreadyPaid: Boolean(t.alreadyPaid),
      batchFinalized: Boolean(t.batchFinalized),
      // Flat fields the Finance portal modal reads directly
      txnId: t.transactionId,
      reference: t.reference,
      amount: t.amount,
      dailyRate: t.dailyRate,
      durationDays: t.durationDays,
      phone: t.phone,
      otp: t.otp, // simulation only — never expose this in production
      status: t.status,
      request: result.request,
      transaction: t,
    });
  } catch (error) {
    console.error('Process payment error:', error);
    res.status(400).json({ message: error.message });
  }
};

/**
 * Pay EVERY student in a batch simultaneously (one click).
 * Each student's amount = daily rate Ã— their own internship days.
 * Creates + auto-confirms a TeleBirr transaction per student, then notifies
 * every actor and each student that the money has been received.
 */
exports.payEntireBatch = async (req, res) => {
  try {
    const result = await workflow.financePayEntireBatch({
      userId: req.user._id,
      batchId: req.params.id,
    });

    res.json({
      message: `Batch payment completed. ${result.successCount} of ${result.totalCount} students paid. All offices and students notified.`,
      batch: result.batch,
      results: result.results,
    });
  } catch (error) {
    console.error('Pay entire batch error:', error);
    res.status(400).json({ message: error.message });
  }
};

// ============================================
// PAYMENT SETTINGS (daily rate)
// ============================================

/**
 * Get the current daily rate settings
 */
exports.getSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne().sort('-updatedAt');
    if (!settings) settings = await Settings.create({ dailyRate: 100, updatedBy: req.user._id });
    res.json({ dailyRate: settings.dailyRate, updatedAt: settings.updatedAt });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ message: 'Failed to load settings' });
  }
};

/**
 * Update the daily rate â€” future payment requests use the new rate
 */
exports.updateSettings = async (req, res) => {
  try {
    const dailyRate = Number(req.body.dailyRate);
    if (!Number.isFinite(dailyRate) || dailyRate < 0) {
      return res.status(400).json({ message: 'Daily rate must be a positive number' });
    }

    let settings = await Settings.findOne().sort('-updatedAt');
    if (settings) {
      settings.dailyRate = dailyRate;
      settings.updatedBy = req.user._id;
      settings = await settings.save();
    } else {
      settings = await Settings.create({ dailyRate, updatedBy: req.user._id });
    }

    await require('../models/AuditLog').create({
      user: req.user._id,
      action: 'update_daily_rate',
      targetId: settings._id,
      targetType: 'PaymentSettings',
      meta: { dailyRate },
    });

    res.json({ message: 'Daily rate saved', dailyRate: settings.dailyRate });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ message: 'Failed to save settings' });
  }
};

// ============================================
// TRANSACTION CONFIRMATION (simulation)
// ============================================

/**
 * Confirm a transaction by its ID with the OTP (Finance portal's modal).
 * Completes the payment and notifies the student that the balance was received.
 */
exports.confirmTransaction = async (req, res) => {
  try {
    const { otp, otpCode } = req.body;
    const result = await TeleBirr.confirmPayment({
      txnId: req.params.txnId,
      otpCode: otp || otpCode,
      userId: req.user._id,
    });

    // If this was the last student in the batch, commit the batch right away
    // so the Individual Payment page behaves like a complete payment run.
    let batchFinalized = false;
    try {
      const transaction = await TeleBirrTransaction.findById(req.params.txnId).select('request');
      const request = transaction?.request
        ? await Request.findById(transaction.request).select('batch')
        : null;
      if (request?.batch) {
        const settlement = await workflow.finalizeBatchIfComplete({
          userId: req.user._id,
          batchId: request.batch,
        });
        batchFinalized = Boolean(settlement.finalized);
      }
    } catch (settlementError) {
      console.warn('Batch finalisation after transaction confirm skipped:', settlementError.message);
    }

    res.json({ ...result, batchFinalized });
  } catch (error) {
    console.error('Confirm transaction error:', error);
    res.status(400).json({ message: error.message });
  }
};

/**
 * Confirm payment with OTP
 * Called by student to confirm their payment
 */
exports.confirmPayment = async (req, res) => {
  try {
    const { otpCode } = req.body;

    if (!otpCode) {
      return res.status(400).json({ message: 'OTP code is required' });
    }

    const result = await TeleBirr.confirmPayment({
      requestId: req.params.id,
      otpCode,
      userId: req.user._id,
    });

    let batchFinalized = false;
    try {
      const request = await Request.findById(req.params.id).select('batch');
      if (request?.batch) {
        const settlement = await workflow.finalizeBatchIfComplete({
          userId: req.user._id,
          batchId: request.batch,
        });
        batchFinalized = Boolean(settlement.finalized);
      }
    } catch (settlementError) {
      console.warn('Batch finalisation after student payment skipped:', settlementError.message);
    }

    res.json({
      message: result.message,
      ...result,
      batchFinalized,
    });
  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(400).json({ message: error.message });
  }
};

/**
 * Verify OTP (check if OTP is valid without confirming)
 */
exports.verifyOtp = async (req, res) => {
  try {
    const { otpCode } = req.body;
    const result = await TeleBirr.verifyOtp({
      requestId: req.params.id,
      otpCode,
    });

    res.json(result);
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ message: 'Failed to verify OTP' });
  }
};

/**
 * Resend OTP
 */
exports.resendOtp = async (req, res) => {
  try {
    const result = await TeleBirr.resendOtp({
      requestId: req.params.id,
      userId: req.user._id,
    });

    res.json(result);
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(400).json({ message: error.message });
  }
};

// ============================================
// PAYMENT HISTORY & REPORTS
// ============================================

/**
 * Get payment history with filters
 */
exports.getPaymentHistory = async (req, res) => {
  try {
    const { status, batch, semester, academicYear, startDate, endDate, page = 1, limit = 20 } = req.query;

    const filter = {};

    if (status) filter.status = status;
    if (batch) filter.batch = batch;

    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, parseInt(limit) || 20);
    const skip = (pageNum - 1) * limitNum;

    const [requests, total] = await Promise.all([
      Request.find(filter)
        .populate('student', STUDENT_POPULATE)
        .populate('batch', 'batchName semester academicYear status')
        .populate('return', 'orgName startDate endDate')
        .sort('-createdAt')
        .skip(skip)
        .limit(limitNum),
      Request.countDocuments(filter),
    ]);

    // Get transactions for each request
    const requestsWithTransactions = await Promise.all(requests.map(async (req) => {
      const transaction = await TeleBirr.getTransactionByRequest(req._id);
      return { request: req, transaction };
    }));

    res.json({
      payments: requestsWithTransactions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({ message: 'Failed to load payment history' });
  }
};

/**
 * Get payment report summary
 */
exports.getPaymentReport = async (req, res) => {
  try {
    const { startTime, endTime } = req.query;

    const timeFilter = {};
    if (startTime || endTime) {
      timeFilter.createdAt = {};
      if (startTime) timeFilter.createdAt.$gte = new Date(startTime);
      if (endTime) timeFilter.createdAt.$lte = new Date(endTime);
    }

    const [
      totalPayments,
      totalAmount,
      paidCount,
      pendingCount,
      rejectedCount,
      paidAmount,
      byStatus,
      recentPayments,
    ] = await Promise.all([
      Request.countDocuments(timeFilter),
      Request.aggregate([
        { $match: { ...timeFilter, status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Request.countDocuments({ ...timeFilter, status: 'paid' }),
      Request.countDocuments({ ...timeFilter, status: 'pending_finance' }),
      Request.countDocuments({ ...timeFilter, status: 'rejected' }),
      Request.aggregate([
        { $match: { ...timeFilter, status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Request.aggregate([
        { $match: timeFilter },
        { $group: { _id: '$status', count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
        { $sort: { _id: 1 } },
      ]),
      Request.find(timeFilter)
        .populate('student', STUDENT_POPULATE)
        .populate('batch', 'batchName')
        .sort('-createdAt')
        .limit(10),
    ]);

    res.json({
      reportPeriod: {
        startTime,
        endTime,
      },
      summary: {
        totalPayments: totalPayments || 0,
        totalAmount: totalAmount?.[0]?.total || 0,
        paidCount,
        pendingCount,
        rejectedCount,
      },
      byStatus: byStatus || [],
      recentPayments: await Promise.all(recentPayments.map(async (r) => ({
        ...r.toObject(),
        transaction: await TeleBirr.getTransactionByRequest(r._id),
      }))),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get payment report error:', error);
    res.status(500).json({ message: 'Failed to generate report' });
  }
};

// ============================================
// STATISTICS
// ============================================

/**
 * Get Finance dashboard statistics
 */
exports.getStats = async (req, res) => {
  try {
    const [
      pendingBatches,
      pendingRequests,
      totalPaid,
      totalPaidAmount,
      todayPaid,
      todayPaidAmount,
    ] = await Promise.all([
      Batch.countDocuments({ status: 'pending_finance' }),
      Request.countDocuments({ status: 'pending_finance' }),
      Batch.countDocuments({ status: 'paid' }),
      Request.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Request.countDocuments({
        status: 'paid',
        updatedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
      Request.aggregate([
        { $match: { status: 'paid', updatedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    res.json({
      pendingBatches,
      pendingRequests,
      totalPaid,
      totalPaidAmount: totalPaidAmount?.[0]?.total || 0,
      todayPaid,
      todayPaidAmount: todayPaidAmount?.[0]?.total || 0,
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: 'Failed to load statistics' });
  }
};
