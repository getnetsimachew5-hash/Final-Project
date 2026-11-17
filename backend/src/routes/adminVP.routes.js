const r = require('express').Router();
const { verifyJWT }   = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { body, validationResult } = require('express-validator');
const c = require('../controllers/adminVP.controller');

r.use(verifyJWT, requireRole('admin_vp'));

// Keep the human-readable reason: portal pages only read `.message`.
const rejectInvalid = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
  }
  next();
};

// View batches pending Admin VP authorization
r.get('/batches', c.viewBatches);

// Get batch details
r.get('/batches/:id', c.getBatchDetails);

// Get supporting documents (return forms + completion letters) for a batch
r.get('/batches/:id/documents', c.documents);

// Full approval trail for one batch (works after it leaves this office)
r.get('/batches/:id/history', c.getBatchHistory);

// FUNCTION 3 — confirm payment availability/authorization
r.post('/batches/:id/confirm-payment',
  body('authorizedAmount')
    .custom((v) => Number(v) > 0)
    .withMessage('Authorized amount must be greater than zero'),
  rejectInvalid,
  c.confirmPayment
);

// FUNCTION 4 — approve (records the decision, does not forward yet)
r.post('/batches/:id/approve',
  require('../middleware/security').validators.comment,
  rejectInvalid,
  c.approveBatch
);

// FUNCTION 6 — forward the approved batch directly to Finance
r.post('/batches/:id/forward', c.forwardBatch);

// Authorize batch (one-step legacy path: approve + forward)
r.post('/batches/:id/authorize',
  require('../middleware/security').validators.comment,
  rejectInvalid,
  c.authorizeBatch
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
