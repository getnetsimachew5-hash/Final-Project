const r = require('express').Router();
const { verifyJWT }   = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const c = require('../controllers/department.controller');

r.use(verifyJWT, requireRole('cs_dept'));

// Student submissions + document verification
r.get('/submissions',              c.listSubmissions);
r.post('/returns/:id/verify',      c.verifyReturn);
r.post('/returns/:id/unverify',    c.unverifyReturn);
r.post('/returns/:id/reject',      c.rejectReturn);   // ← ADD THIS
r.post('/returns/:id/message',     c.sendMessage);    // message a student (no rejection)
r.post('/students/:studentId/reopen-payment', c.grantAnotherPayment); // controlled post-paid update

// Payment batches / requests
r.get('/batches',                  c.listBatches);
r.get('/requests',                 c.listRequests);
r.get('/history',                  c.listHistory);
r.post('/batches',                 c.createBatch);
r.patch('/batches/:id',            c.updateBatch);    // edit a draft ("Edit if Necessary")
r.get('/batches/:id',              c.getBatch);       // single batch (edit form)
r.post('/batches/:id/forward',     c.forwardBatch);
r.post('/batches/:id/reject',      c.rejectBatch);
r.post('/batches/:id/cancel',      c.cancelBatch);

module.exports = r;
