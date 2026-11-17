const crypto = require('crypto');
const TeleBirrTransaction = require('../models/TeleBirrTransaction');
const User = require('../models/User');
const { internshipDays } = require('../utils/dates');

/**
 * ============================================
 * TELEBIRR PAYMENT SERVICE
 * ============================================
 * Simulates Ethiopia's TeleBirr mobile money payment system.
 * In production, this would integrate with the actual TeleBirr API.
 * 
 * Payment Flow:
 * 1. Finance initiates payment → creates transaction record
 * 2. OTP code generated and sent to student's phone (simulated)
 * 3. Student enters OTP to confirm (simulated)
 * 4. Payment confirmed → status updates to 'paid'
 * ============================================
 */

// Payment settings (in production, load from database)
const DAILY_RATE = 100; // ETB per day

/**
 * Calculate payment amount based on internship duration
 * Amount = Daily Rate × Number of Days
 */
exports.computeAmount = async (internshipReturn) => {
  if (!internshipReturn) {
    return { dailyRate: DAILY_RATE, durationDays: 0, amount: 0 };
  }

  const start = new Date(internshipReturn.startDate);
  const end = new Date(internshipReturn.endDate);

  // Inclusive day count — each student's own start/end dates decide the amount.
  const durationDays = internshipDays(start, end);

  // Amount = daily rate × duration
  const amount = DAILY_RATE * durationDays;

  return {
    dailyRate: DAILY_RATE,
    durationDays,
    amount,
  };
};

/**
 * Initiate a TeleBirr payment
 * Creates transaction record and generates OTP
 */
exports.initiatePayment = async ({ requestId, studentId, phone, amount, dailyRate, durationDays, processedBy }) => {
  // Validate phone number
  if (!phone || !/^[\+]?[\d]{9,15}$/.test(phone.replace(/\s/g, ''))) {
    throw new Error('Invalid phone number for TeleBirr payment');
  }

  // Generate OTP (6-digit code)
  const otpCode = crypto.randomInt(100000, 999999).toString();

  // OTP expires in 10 minutes
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Check for an existing transaction. A retry must be safe: Finance officers
  // often click "Process" again after a reload, and an expired OTP must not
  // leave the request permanently stuck with "Payment already initiated".
  const existing = await TeleBirrTransaction.findOne({ request: requestId }).select('+otpCode');
  if (existing) {
    if (existing.status === 'confirmed') {
      // Heal a request that was confirmed but never updated (older data).
      await require('../models/PaymentRequest').findByIdAndUpdate(existing.request, {
        status: 'paid',
      });
      return {
        transactionId: existing._id,
        reference: existing.reference,
        amount: existing.amount,
        dailyRate: existing.dailyRate,
        durationDays: existing.durationDays,
        phone: existing.phone,
        otp: null,
        status: 'confirmed',
        alreadyPaid: true,
        message: 'This payment has already been confirmed.',
      };
    }

    const otpStillValid =
      existing.status === 'otp_sent' &&
      existing.otpExpiresAt &&
      new Date() <= existing.otpExpiresAt;

    if (otpStillValid) {
      // Reuse the live OTP instead of creating a second transaction. Only
      // refresh the registered phone if the student corrected it.
      if (existing.phone !== phone) {
        existing.phone = phone;
        await existing.save();
      }
      return {
        transactionId: existing._id,
        reference: existing.reference,
        amount: existing.amount,
        dailyRate: existing.dailyRate,
        durationDays: existing.durationDays,
        phone: existing.phone,
        otp: existing.otpCode,
        status: 'otp_sent',
        reused: true,
        message: 'OTP already sent to the student. Enter the code to confirm payment.',
      };
    }

    // Expired OTP or a failed/initiated attempt — reissue the same record so
    // the unique `request` index is never violated.
    existing.amount = amount;
    existing.dailyRate = dailyRate;
    existing.durationDays = durationDays;
    existing.phone = phone;
    existing.otpCode = otpCode;
    existing.otpExpiresAt = otpExpiresAt;
    existing.status = 'otp_sent';
    existing.processedBy = processedBy;
    existing.confirmedAt = undefined;
    await existing.save();

    console.log(`[TELEBIRR SIMULATION] New OTP sent to ${phone}: ${otpCode}`);
    console.log(`[TELEBIRR SIMULATION] Reference: ${existing.reference}`);

    await require('../models/Notification').create({
      recipient: studentId,
      message: `📱 A new TeleBirr OTP was sent to your registered phone (${phone}). Enter the code to confirm your payment of ${amount} ETB. Reference: ${existing.reference}`,
      type: 'payment_otp',
      link: '/student/status',
    });

    await require('../models/AuditLog').create({
      user: processedBy,
      action: 'reissue_telebirr_payment',
      targetId: requestId,
      targetType: 'PaymentRequest',
      meta: { reference: existing.reference, phone, amount },
    });

    return {
      transactionId: existing._id,
      reference: existing.reference,
      amount,
      dailyRate,
      durationDays,
      phone,
      otp: otpCode,
      status: 'otp_sent',
      reissued: true,
      message: 'A new OTP was sent to the student. Enter the code to confirm payment.',
    };
  }

  // Generate unique reference number
  const reference = generateReference();

  // Create transaction record
  const transaction = await TeleBirrTransaction.create({
    request: requestId,
    student: studentId,
    amount,
    dailyRate,
    durationDays,
    phone,
    reference,
    otpCode, // Hidden from normal queries (select: false)
    otpExpiresAt,
    status: 'otp_sent',
    processedBy,
  });

  // In production: Send OTP to student's phone via TeleBirr API
  // For simulation: Log the OTP (in real system, this would go to SMS gateway)
  console.log(`[TELEBIRR SIMULATION] OTP sent to ${phone}: ${otpCode}`);
  console.log(`[TELEBIRR SIMULATION] Reference: ${reference}`);

  // Create notification for student
  await require('../models/Notification').create({
    recipient: studentId,
    message: `📱 TeleBirr OTP sent to your registered phone (${phone}). Enter the code to confirm your payment of ${amount} ETB. Reference: ${reference}`,
    type: 'payment_otp',
    link: '/student/status',
  });

  await require('../models/AuditLog').create({
    user: processedBy,
    action: 'initiate_telebirr_payment',
    targetId: requestId,
    targetType: 'PaymentRequest',
    meta: { reference, phone, amount },
  });

  return {
    transactionId: transaction._id,
    reference,
    amount,
    dailyRate,
    durationDays,
    phone,
    // In this simulation the OTP is surfaced to the Finance portal so it can
    // auto-confirm payments (in production the student would receive it by SMS
    // only and it would NEVER be returned here).
    otp: otpCode,
    status: 'otp_sent',
    message: 'OTP sent to your phone. Enter the code to confirm payment.',
  };
};

/**
 * Confirm payment with OTP
 * Student (or Finance on the student's behalf in the simulation) enters the
 * OTP to complete the payment.
 *
 * Accepts EITHER a transaction id (txnId, used by the Finance portal) or a
 * request id (requestId, used by the student flow) so both call sites work.
 */
exports.confirmPayment = async ({ txnId, requestId, otpCode, userId }) => {
  // Find transaction (including otpCode field)
  const transaction = txnId
    ? await TeleBirrTransaction.findById(txnId).select('+otpCode')
    : await TeleBirrTransaction.findOne({ request: requestId }).select('+otpCode');

  if (!transaction) {
    throw new Error('No payment transaction found for this request');
  }

  if (transaction.status === 'confirmed') {
    // Idempotent: a repeated confirm click must not fail after money moved.
    return {
      success: true,
      alreadyConfirmed: true,
      reference: transaction.reference,
      amount: transaction.amount,
      confirmedAt: transaction.confirmedAt,
      message: 'Payment was already confirmed. The student has received the balance.',
    };
  }

  if (transaction.status !== 'otp_sent') {
    throw new Error(`Payment is ${transaction.status}. It cannot be confirmed because it is not awaiting an OTP. Start a new payment.`);
  }

  // Check OTP expiration
  if (new Date() > transaction.otpExpiresAt) {
    throw new Error('OTP has expired. Please request a new payment.');
  }

  // Verify OTP
  if (transaction.otpCode !== otpCode) {
    // Increment failed attempts (in production, would lock after 3 failures)
    throw new Error('Invalid OTP code. Please check and try again.');
  }

  // The registered account phone is the source of truth. Refresh it just before
  // settlement so a corrected student number can never be paid on the old one.
  if (transaction.student) {
    const account = await User.findById(transaction.student).select('phone').lean();
    const registered = String(account?.phone || '').replace(/\s+/g, '').trim();
    if (registered) transaction.phone = registered;
  }

  // Confirm payment
  transaction.status = 'confirmed';
  transaction.confirmedAt = new Date();
  transaction.processedBy = userId;
  await transaction.save();

  // Update request status
  await require('../models/PaymentRequest').findByIdAndUpdate(transaction.request, {
    status: 'paid',
  });

  // Update return status
  const request = await require('../models/PaymentRequest').findById(transaction.request);
  if (request?.return) {
    await require('../models/InternshipReturn').findByIdAndUpdate(request.return, {
      status: 'paid',
    });
  }

  // Notify the student that the balance has been received on their phone.
  // A deleted student account must not make a completed payment look failed.
  if (transaction.student) {
    try {
      await require('../models/Notification').create({
        recipient: transaction.student,
        message: `💰 Payment received! Your internship balance of ${transaction.amount} ETB has been credited to your TeleBirr account (${transaction.phone}). Reference: ${transaction.reference}`,
        type: 'payment_received',
        link: '/student/status',
      });
    } catch (e) {
      console.warn('Payment notification skipped:', e.message);
    }
  }

  // Log audit
  try {
    await require('../models/AuditLog').create({
      user: userId,
      action: 'confirm_telebirr_payment',
      targetId: transaction.request,
      targetType: 'PaymentRequest',
      meta: { reference: transaction.reference, amount: transaction.amount },
    });
  } catch (e) {
    console.warn('Payment audit log skipped:', e.message);
  }

  return {
    success: true,
    reference: transaction.reference,
    amount: transaction.amount,
    confirmedAt: transaction.confirmedAt,
    message: 'Payment confirmed! Money has been sent via TeleBirr.',
  };
};

/**
 * Verify OTP without confirming (for validation before submission)
 */
exports.verifyOtp = async ({ requestId, otpCode }) => {
  const transaction = await TeleBirrTransaction.findOne({ request: requestId }).select('+otpCode');

  if (!transaction) {
    return { valid: false, reason: 'No transaction found' };
  }

  if (transaction.status !== 'otp_sent') {
    return { valid: false, reason: `Payment already ${transaction.status}` };
  }

  if (new Date() > transaction.otpExpiresAt) {
    return { valid: false, reason: 'OTP expired' };
  }

  return {
    valid: transaction.otpCode === otpCode,
    reason: transaction.otpCode === otpCode ? 'Valid OTP' : 'Invalid OTP',
  };
};

/**
 * Resend OTP (if expired or not received)
 */
exports.resendOtp = async ({ requestId, userId }) => {
  const transaction = await TeleBirrTransaction.findOne({ request: requestId });

  if (!transaction) {
    throw new Error('No payment transaction found');
  }

  if (transaction.status !== 'otp_sent') {
    throw new Error(`Payment already ${transaction.status}. Cannot resend OTP.`);
  }

  // Generate new OTP
  const otpCode = crypto.randomInt(100000, 999999).toString();
  transaction.otpCode = otpCode;
  transaction.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await transaction.save();

  console.log(`[TELEBIRR SIMULATION] New OTP sent to ${transaction.phone}: ${otpCode}`);

  await require('../models/Notification').create({
    recipient: transaction.student,
    message: `📱 New TeleBirr OTP sent to your registered phone (${transaction.phone}). Code: ${otpCode}. Reference: ${transaction.reference}`,
    type: 'payment_otp',
    link: '/student/status',
  });

  await require('../models/AuditLog').create({
    user: userId,
    action: 'resend_telebirr_otp',
    targetId: requestId,
    targetType: 'PaymentRequest',
    meta: { reference: transaction.reference },
  });

  return { success: true, message: 'New OTP sent to your phone' };
};

/**
 * Generate unique payment reference
 * Format: TB-YYYYMMDD-XXXXXX (6 random digits)
 */
function generateReference() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomInt(100000, 999999);
  return `TB-${date}-${random}`;
}

// The Finance guided workflow needs settlement references from the same
// generator that TeleBirr uses for individual transactions.
exports.generateReference = generateReference;

/**
 * Return a transaction (including its simulated OTP) for the Finance guided
 * workflow. If the OTP has expired, a fresh one is generated so the officer can
 * finish the simulation without deleting the transaction.
 */
exports.getSimulationTransaction = async (requestId) => {
  const transaction = await TeleBirrTransaction.findOne({ request: requestId }).select('+otpCode');
  if (!transaction) return null;

  if (
    transaction.status === 'otp_sent' &&
    transaction.otpExpiresAt &&
    new Date() > transaction.otpExpiresAt
  ) {
    transaction.otpCode = crypto.randomInt(100000, 999999).toString();
    transaction.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await transaction.save();

    await require('../models/Notification').create({
      recipient: transaction.student,
      message: `📱 A new TeleBirr OTP was generated for your internship payment. Simulation code: ${transaction.otpCode}. Reference: ${transaction.reference}`,
      type: 'payment_otp',
      link: '/student/status',
    });
  }

  return transaction;
};

/**
 * Get transaction by reference
 */
exports.getTransactionByReference = async (reference) => {
  return await TeleBirrTransaction.findOne({ reference })
    .populate('student', 'fullName phone')
    .populate('request', 'amount');
};

/**
 * Get transaction by request ID
 */
exports.getTransactionByRequest = async (requestId) => {
  return await TeleBirrTransaction.findOne({ request: requestId })
    .populate('student', 'fullName phone')
    .populate('request', 'amount');
};

/**
 * Get all transactions for a student
 */
exports.getStudentTransactions = async (studentId) => {
  return await TeleBirrTransaction.find({ student: studentId })
    .populate('request', 'amount batch')
    .sort('-createdAt');
};

/**
 * Check payment status
 */
exports.checkPaymentStatus = async (requestId) => {
  const transaction = await TeleBirrTransaction.findOne({ request: requestId });
  
  if (!transaction) {
    return { status: 'not_initiated', message: 'No payment has been initiated' };
  }

  return {
    status: transaction.status,
    reference: transaction.reference,
    amount: transaction.amount,
    phone: transaction.phone,
    createdAt: transaction.createdAt,
    confirmedAt: transaction.confirmedAt,
    otpExpiresAt: transaction.otpExpiresAt,
    message: getStatusMessage(transaction.status),
  };
};

/**
 * Get human-readable status message
 */
function getStatusMessage(status) {
  const messages = {
    initiated: 'Payment initiated. Waiting for processing.',
    otp_sent: 'OTP sent to your phone. Enter code to confirm.',
    confirmed: '✅ Payment confirmed! Money sent via TeleBirr.',
    failed: '❌ Payment failed. Contact Finance for assistance.',
  };
  return messages[status] || 'Unknown status';
}
