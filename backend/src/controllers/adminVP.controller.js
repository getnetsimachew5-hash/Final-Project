const { STUDENT_POPULATE } = require('../utils/studentFields');
const Batch    = require('../models/PaymentBatch');
const Request  = require('../models/PaymentRequest');
const Return   = require('../models/InternshipReturn');
const Letter   = require('../models/CompletionLetter');
const User     = require('../models/User');
const workflow = require('../services/workflow.service');

/**
 * ============================================
 * ADMIN VP ACTOR CONTROLLER
 * ============================================
 * The Admin VP Office provides administrative authorization.
 * Functions:
 * - Register/login
 * - View academically endorsed requests
 * - Review administrative requirements
 * - Confirm payment availability/authorization
 * - Approve request
 * - Reject request
 * - Add comments
 * - Forward approved request directly to Finance
 * - View approval history
 */

// ============================================
// VIEW BATCHES
// ============================================

/**
 * Get all batches pending Admin VP authorization
 * These are batches endorsed by Academic VP
 */
exports.viewBatches = async (req, res) => {
  try {
    const batches = await Batch.find({ status: 'pending_admin_vp' })
      .populate('students', STUDENT_POPULATE)
      .populate('createdBy', 'fullName')
      .populate('history.actor', 'fullName role')
      .sort('-createdAt');

    const batchesWithRequests = await Promise.all(
      batches.map(async (batch) => {
        const requests = await Request.find({ batch: batch._id })
          .populate('student', STUDENT_POPULATE)
          .populate('return', 'orgName startDate endDate');
        
        return {
          ...batch.toObject(),
          requests,
          studentCount: batch.students.length,
          totalAmount: requests.reduce((sum, r) => sum + r.amount, 0),
        };
      })
    );

    res.json({
      batches: batchesWithRequests,
      pendingCount: batchesWithRequests.length,
    });
  } catch (error) {
    console.error('View batches error:', error);
    res.status(500).json({ message: 'Failed to load batches' });
  }
};

/**
 * Get batch details with full information
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

    if (batch.status !== 'pending_admin_vp') {
      return res.status(400).json({
        message: `Batch is ${batch.status}. Can only view pending_admin_vp batches.`
      });
    }

    const requests = await Request.find({ batch: batch._id })
      .populate('student', STUDENT_POPULATE)
      .populate('return', 'orgName startDate endDate supervisorName');

    // Calculate financial summary
    const totalAmount = requests.reduce((sum, r) => sum + (r.amount || 0), 0);
    const averageAmount = requests.length > 0 ? totalAmount / requests.length : 0;

    res.json({
      batch,
      requests,
      summary: {
        studentCount: batch.students.length,
        totalAmount,
        averageAmount: Math.round(averageAmount * 100) / 100,
      },
    });
  } catch (error) {
    console.error('Get batch details error:', error);
    res.status(500).json({ message: 'Failed to load batch details' });
  }
};

// Get supporting documents (return forms + completion letters) for a batch
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
          student: { _id: s._id, fullName: s.fullName || 'Unknown', institutionalId: s.institutionalId || '—' },
          returnForm: ret ? { orgName: ret.orgName, orgAddress: ret.orgAddress, startDate: ret.startDate, endDate: ret.endDate, status: ret.status, supervisorName: ret.supervisorName } : null,
          letterUrl: letter ? letter.filePath : null,
          letterVerified: letter ? Boolean(letter.isVerified) : false,
        };
      }),
    });
  } catch (error) {
    console.error('Admin VP documents error:', error);
    res.status(500).json({ message: 'Failed to load documents', detail: error.message });
  }
};

// ============================================
// AUTHORIZATION
// ============================================

/**
 * Confirm payment availability/authorization (function 3).
 * Saves the amount the office authorizes; no workflow transition yet.
 */
exports.confirmPayment = async (req, res) => {
  try {
    const batch = await workflow.adminVpConfirmPayment({
      userId: req.user._id,
      batchId: req.params.id,
      authorizedAmount: req.body.authorizedAmount,
      paymentReference: req.body.paymentReference,
    });

    res.json({
      message: `Payment availability confirmed — ${Number(batch.authorizedAmount).toLocaleString()} ETB authorized.`,
      batch,
    });
  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(400).json({ message: error.message });
  }
};

/**
 * Approve the batch (function 4).
 * Records the decision; forwarding to Finance is a separate step.
 */
exports.approveBatch = async (req, res) => {
  try {
    const batch = await workflow.adminVpApproveBatch({
      userId: req.user._id,
      batchId: req.params.id,
      comment: req.body.comment,
    });

    res.json({
      message: 'Batch approved. You can now forward it to Finance.',
      batch,
    });
  } catch (error) {
    console.error('Approve batch error:', error);
    res.status(400).json({ message: error.message });
  }
};

/**
 * Forward an approved batch directly to Finance (function 6).
 * This is the hand-off to the next actor: pending_admin_vp → pending_finance.
 */
exports.forwardBatch = async (req, res) => {
  try {
    const batch = await workflow.adminVpForwardBatch({
      userId: req.user._id,
      batchId: req.params.id,
    });

    res.json({
      message: 'Batch forwarded to Finance for payment processing.',
      batch,
    });
  } catch (error) {
    console.error('Forward batch error:', error);
    res.status(400).json({ message: error.message });
  }
};

/**
 * Authorize batch - confirm administrative approval
 * Forwards directly to Finance for payment processing
 */
exports.authorizeBatch = async (req, res) => {
  try {
    const { comment } = req.body;

    if (!comment || !comment.trim()) {
      return res.status(400).json({
        message: 'Authorization comment is required. Please confirm your authorization decision.'
      });
    }

    const result = await workflow.adminVpAuthorizeBatch({
      userId: req.user._id,
      batchId: req.params.id,
      comment: comment.trim(),
    });

    res.json({
      message: 'Batch authorized. Forwarded to Finance for payment processing.',
      batch: result,
    });
  } catch (error) {
    console.error('Authorize batch error:', error);
    res.status(400).json({ message: error.message });
  }
};

/**
 * Reject batch - administrative requirements not met
 * Sends back to Academic VP for correction
 */
exports.rejectBatch = async (req, res) => {
  try {
    const { comment } = req.body;

    if (!comment || !comment.trim()) {
      return res.status(400).json({
        message: 'Rejection reason is required. Please explain the administrative issue.'
      });
    }

    const result = await workflow.adminVpRejectBatch({
      userId: req.user._id,
      batchId: req.params.id,
      comment: comment.trim(),
    });

    res.json({
      message: 'Batch rejected. Sent back to Academic VP for correction.',
      batch: result,
    });
  } catch (error) {
    console.error('Reject batch error:', error);
    res.status(400).json({ message: error.message });
  }
};

// ============================================
// HISTORY & STATS
// ============================================

/**
 * Full approval trail for one batch (function 7).
 * Unlike getBatchDetails, this works after the batch has moved on to Finance,
 * so the Admin VP can follow the hand-off.
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
      .populate('return', 'orgName startDate endDate');

    res.json({
      batch,
      requests,
      summary: {
        studentCount: (batch.students || []).length,
        totalAmount: requests.reduce((sum, r) => sum + (r.amount || 0), 0),
        authorizedAmount: batch.authorizedAmount,
      },
    });
  } catch (error) {
    console.error('Get batch history error:', error);
    res.status(500).json({ message: 'Failed to load approval history' });
  }
};

/**
 * Get Admin VP processing history
 */
exports.getHistory = async (req, res) => {
  try {
    // Everything this office acted on, plus batches that have moved further
    // down the pipeline (forwarded → Finance → paid).
    const batches = await Batch.find({
      $or: [
        { 'history.actor': req.user._id },
        { status: { $in: ['pending_finance', 'paid'] } },
      ],
    })
      .populate('students', STUDENT_POPULATE)
      .populate('createdBy', 'fullName role')
      .populate('history.actor', 'fullName role')
      .sort('-updatedAt')
      .limit(50);

    res.json({ batches });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ message: 'Failed to load history' });
  }
};

/**
 * Get Admin VP dashboard statistics
 */
exports.getStats = async (req, res) => {
  try {
    const [
      pendingCount,
      totalAuthorized,
    ] = await Promise.all([
      Batch.countDocuments({ status: 'pending_admin_vp' }),
      Batch.countDocuments({ 'history.action': 'authorized' }),
    ]);

    res.json({
      pendingBatches: pendingCount,
      totalAuthorized,
      recentActivity: await Batch.find({ 'history.action': 'authorized' })
        .sort('-createdAt')
        .limit(10)
        .populate('students', STUDENT_POPULATE),
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: 'Failed to load statistics' });
  }
};
