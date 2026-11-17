const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

/**
 * Completion-letter uploads.
 *
 * IMPORTANT: the destination is an ABSOLUTE path derived from __dirname, so
 * files always land in <backend>/uploads/letters — the exact folder that
 * app.js serves at /uploads. (A relative path would put files in a different
 * folder whenever the server is started from another working directory, and
 * then the "View letter" links would 404.)
 */
const UPLOADS_ROOT = path.join(__dirname, '..', '..', 'uploads');
const dir = path.join(UPLOADS_ROOT, 'letters');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const ALLOWED_EXT  = ['.pdf', '.jpg', '.jpeg', '.png'];
const ALLOWED_MIME = [
  'application/pdf',
  'application/x-pdf',
  'image/jpeg',
  'image/jpg',   // some browsers/phones send this non-standard value
  'image/pjpeg',
  'image/png',
];

const storage = multer.diskStorage({
  destination: dir,
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase() || '.bin';
    cb(null, `${Date.now()}-${req.user._id}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  // Accept when EITHER the MIME type OR the extension is allowed — some
  // devices report generic MIME types (application/octet-stream).
  const ok = ALLOWED_MIME.includes(file.mimetype) || ALLOWED_EXT.includes(ext);
  if (!ok) {
    return cb(new Error('Only PDF, JPG or PNG files are allowed'));
  }
  cb(null, true);
};

const uploader = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB (phone photos often exceed 5 MB)
});

// Exposed so controllers can store a path RELATIVE to the served folder.
uploader.UPLOADS_ROOT = UPLOADS_ROOT;

module.exports = uploader;
