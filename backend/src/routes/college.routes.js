const r = require('express').Router();
const { verifyJWT }   = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const c = require('../controllers/college.controller');

r.use(verifyJWT, requireRole('college'));
r.get('/batches', c.list);
r.get('/payments', c.payments);
r.get('/batches/:id/documents', c.documents);
// --- Per-student review at the College ---
// Every student can be approved or rejected INDIVIDUALLY. Bulk approval is a
// convenience, but it skips (and notifies) any student with incomplete info.
r.post('/batches/:id/students/:studentId/approve', c.approveStudent);
r.post('/batches/:id/students/:studentId/reject', c.rejectStudent);
r.post('/batches/:id/approve-all', c.approveAllStudents);
// Explicit action: identify missing information and notify the student
// automatically so they can fill in the correct details.
r.post('/batches/:id/students/:studentId/request-info', c.requestMissingInfo);
// Batch-level request: ask the CS Department to correct/verify all students.
r.post('/batches/:id/request-cs-correction', c.requestCsCorrection);
// One click: forward every individually-approved student to the Academic VP.
r.post('/batches/:id/forward-approved', c.forwardApproved);
// Whole-batch actions (kept for compatibility).
r.post('/batches/:id/approve', c.approve);
r.post('/batches/:id/reject', c.reject);

module.exports = r;
