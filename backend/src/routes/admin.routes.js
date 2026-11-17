const r = require('express').Router();
const { verifyJWT }   = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { validationResult } = require('express-validator');
const c = require('../controllers/admin.controller');

r.use(verifyJWT, requireRole('admin'));

// ============================================
// USER MANAGEMENT
// ============================================

// Get all users
r.get('/users', c.listUsers);

// Create a new user (admin adds users directly to the system)
r.post('/users', c.createUser);

// Get users who cannot log in
r.get('/users/not-logged-in', c.notLoggedInUsers);

// Get pending users (awaiting approval)
r.get('/users/pending', c.pendingUsers);

// Get single user
r.get('/users/:id', c.getUser);

// Approve user
r.patch('/users/:id/approve', c.approveUser);

// Reject/suspend user
r.patch('/users/:id/reject',
  require('../middleware/security').validators.reason,
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
  c.rejectUser
);

// Verify student identity
r.patch('/users/:id/verify', c.verifyStudent);

// Update user
r.patch('/users/:id',
  require('../middleware/security').validators.fullName,
  require('../middleware/security').validators.email,
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
  c.updateUser
);

// Delete user
r.delete('/users/:id', c.deleteUser);

// ============================================
// AUDIT LOGS
// ============================================

// Get audit logs
r.get('/audit-logs', c.auditLogs);

// Get audit statistics
r.get('/audit-logs/stats', c.getAuditStats);

// ============================================
// SYSTEM STATISTICS
// ============================================

// Get system statistics
r.get('/stats', c.getStats);

// ============================================
// ORGANIZATION MANAGEMENT
// ============================================

// Get organizations
r.get('/organizations', c.getOrganizations);

// Delete organization
r.delete('/organizations/:id', c.deleteOrganization);

// ============================================
// BACKUP
// ============================================

// Database backup
r.get('/backup', c.backup);

module.exports = r;
