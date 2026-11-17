const r = require('express').Router();
const { verifyJWT }   = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { validationResult } = require('express-validator');
const c = require('../controllers/academicVP.controller');

r.use(verifyJWT, requireRole('academic_vp'));

// View batches pending Academic VP review
r.get('/batches', c.viewBatches);

// Documents for a batch
r.get('/batches/:id/documents', c.documents);
r.get('/batches/:id', c.getBatchDetails);

// Express-validator failures used to come back as `{ errors: [...] }` only —
// every portal page reads `.message`, so users just saw "Failed to endorse".
const rejectInvalid = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    return res.status(400).json({ message: first.msg, errors: errors.array() });
  }
  next();
};

// Endorse batch (approve)
r.post('/batches/:id/endorse',
  // Validate comment
  require('../middleware/security').validators.comment,
  rejectInvalid,
  c.endorseBatch
);

// Reject batch
r.post('/batches/:id/reject',
  require('../middleware/security').validators.comment,
  rejectInvalid,
  c.rejectBatch
);

// Get processing history
r.get('/history', c.getHistory);

// Get dashboard statistics
r.get('/stats', c.getStats);

module.exports = r;
