const { STUDENT_POPULATE } = require('../utils/studentFields');
const Batch    = require('../models/PaymentBatch');
const Request  = require('../models/PaymentRequest');
const Return   = require('../models/InternshipReturn');
const Letter   = require('../models/CompletionLetter');
const User     = require('../models/User');
const workflow = require('../services/workflow.service');

/**
 * ============================================
 * ACADEMIC VP ACTOR CONTROLLER
 * ============================================
 * The Academic VP Office verifies academic eligibility.
 * Functions:
 * - Register/login
 * - View College-approved requests
 * - Review academic eligibility
 * - Review supporting documents
 * - Endorse eligible request
 * - Reject request if requirements not satisfied
 * - Provide rejection comments
 * - Forward endorsed request to Admin VP
 * - Monitor processed requests
 */

// ============================================
// VIEW COLLEGE-APPROVED REQUESTS
// ============================================

/**
 * View batches awaiting Academic VP review (college-approved â†’ pending_academic_vp)
 * Also picks up 'college_approved' requests a previous forward left behind,
 * so the Academic VP always sees EVERY student the College sent.
 */
exports.viewBatches = async (req, res) => {
  try {
    const batches = await Batch.find({ status: 'pending_academic_vp' })
      .populate('students', STUDENT_POPULATE)
      .populate('createdBy', 'fullName')
      .populate('history.actor', 'fullName role')
      .sort('-createdAt');

    const batchesWithRequests = await Promise.all(
      batches.map(async (batch) => {
        const requests = await Request.find({
          batch: batch._id,
          status: { $in: ['pending_academic_vp', 'college_approved'] },
        })
          .populate('student', STUDENT_POPULATE)
          .populate('return', 'orgName startDate endDate supervisorName supervisorPhone');
        
        return {
          ...batch.toObject(),
          requests,
          studentCount: requests.length,
          totalAmount: requests.reduce((sum, r) => sum + (r.amount || 0), 0),
        };
      })
    );

    res.json({
      batches: batchesWithRequests,
      pendingCount: batchesWithRequests.length,
    });
  } catch (error) {
    console.error('Academic VP view batches error:', error);
    res.status(500).json({ message: 'Failed to load batches', detail: error.message });
  }
};

// Get supporting documents for a batch
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
          student: { _id: s._id, fullName: s.fullName || 'Unknown', institutionalId: s.institutionalId || 'â€”' },
          returnForm: ret ? { orgName: ret.orgName, orgAddress: ret.orgAddress, startDate: ret.startDate, endDate: ret.endDate, status: ret.status, supervisorName: ret.supervisorName } : null,
          letterUrl: letter ? letter.filePath : null,
          letterVerified: letter ? Boolean(letter.isVerified) : false,
        };
      }),
    });
  } catch (error) {
    console.error('Academic VP documents error:', error);
    res.status(500).json({ message: 'Failed to load documents', detail: error.message });
  }
};

/**
 * Get batch details with full student information
 */
exports.getBatchDetails = async (req, res) => {
  try {
    const batch = await Batch.findById(req.params.id)
      .populate('students', STUDENT_POPULATE)
      .populate('createdBy', 'fullName')
      .populate('history.actor', 'fullName role')
      .populate({
        path: 'students',
        populate: {
          path: 'return',
          model: 'InternshipReturn',
        },
      });

    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    if (batch.status !== 'pending_academic_vp') {
      return res.status(400).json({
        message: `Batch is ${batch.status}. Can only view pending_academic_vp batches.`
      });
    }

    const requests = await Request.find({ batch: batch._id, status: 'pending_academic_vp' })
      .populate('student', STUDENT_POPULATE)
      .populate('return', 'orgName startDate endDate supervisorName');

    res.json({
      batch,
      requests,
      studentCount: requests.length,
      totalAmount: requests.reduce((sum, r) => sum + (r.amount || 0), 0),
    });
  } catch (error) {
    console.error('Get batch details error:', error);
    res.status(500).json({ message: 'Failed to load batch details' });
  }
};

// ============================================
// ACADEMIC ELIGIBILITY CHECK
// ============================================

// Endorse batch (approve academically) â†’ forward to Admin VP
exports.endorseBatch = async (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment || !comment.trim()) {
      return res.status(400).json({ message: 'Endorsement comment is required. Explain academic eligibility.' });
    }
    const result = await workflow.academicVpEndorseBatch({
      userId: req.user._id,
      batchId: req.params.id,
      comment: comment.trim(),
    });
    res.json({
      message: 'Batch academically endorsed. Forwarded to Administrative VP for authorization.',
      batch: result,
    });
  } catch (error) {
    console.error('Endorse batch error:', error);
    res.status(400).json({ message: error.message });
  }
};

// Reject batch if requirements not satisfied â†’ back to College with comment
exports.rejectBatch = async (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment || !comment.trim()) {
      return res.status(400).json({ message: 'Rejection comments are required. Explain what is missing/wrong.' });
    }
    const result = await workflow.academicVpRejectBatch({
      userId: req.user._id,
      batchId: req.params.id,
      comment: comment.trim(),
    });
    res.json({
      message: 'Batch rejected and returned to College Office with academic comments. Ask the College to send corrected information.',
      batch: result,
    });
  } catch (error) {
    console.error('Reject batch error:', error);
    res.status(400).json({ message: error.message });
  }
};

// Get processing history - batches acted on or currently at next stages
exports.getHistory = async (req, res) => {
  try {
    const batches = await Batch.find({
      $or: [
        { status: { $in: ['pending_admin_vp', 'pending_finance', 'paid'] } },
        { 'history.actor': req.user._id },
      ]
    })
      .populate('students', STUDENT_POPULATE)
      .populate('history.actor', 'fullName role')
      .sort('-createdAt')
      .limit(80);

    res.json({ batches });
  } catch (error) {
    console.error('Academic VP history error:', error);
    res.status(500).json({ message: 'Failed to load history', detail: error.message });
  }
};

// ============================================
// STATISTICS
// ============================================

/**
 * Get Academic VP dashboard statistics
 */
exports.getStats = async (req, res) => {
  try {
    const [
      pendingCount,
      totalProcessed,
      totalStudents,
    ] = await Promise.all([
      Batch.countDocuments({ status: 'pending_academic_vp' }),
      Batch.countDocuments({ 
        $or: [
          { status: { $in: ['pending_admin_vp', 'pending_finance', 'paid'] } },
          { 'history.actor': req.user._id },
        ]
      }),
      Request.countDocuments({
        status: { $in: ['pending_academic_vp', 'pending_admin_vp', 'pending_finance', 'paid'] }
      }),
    ]);

    res.json({
      pendingBatches: pendingCount,
      totalProcessed: totalProcessed,
      totalStudents: totalStudents,
      recentActivity: await Batch.find({ 'history.actor': req.user._id })
        .sort('-createdAt')
        .limit(10)
        .populate('students', STUDENT_POPULATE),
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: 'Failed to load statistics' });
  }
};
