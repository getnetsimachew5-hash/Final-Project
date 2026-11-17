const r = require('express').Router();
const { verifyJWT }   = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const upload          = require('../middleware/upload');
const c = require('../controllers/student.controller');

// Wrap multer so file errors produce a clear 400 message instead of a generic 500.
const uploadSingle = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File is too large. Maximum size is 10 MB.' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ message: 'Unexpected file field. Please use the file picker.' });
    }
    return res.status(400).json({ message: err.message || 'File upload failed. Please try again.' });
  });
};

r.use(verifyJWT, requireRole('student'));
r.post('/return', c.submitReturn);
r.post('/letter', uploadSingle, c.uploadLetter);
r.get('/status', c.myStatus);
r.patch('/profile', c.updateProfile);
r.get('/history', c.myPaymentHistory);
r.get('/notifications', c.myNotifications);
r.post('/notifications/read', c.markRead);
r.post('/verify-identity', c.verifyIdentity);

module.exports = r;
