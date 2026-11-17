const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const path    = require('path');
require('dotenv').config();

// Security middleware
const { securityHeaders, authLimiter, apiLimiter, sanitizeInput, errorHandler, auditLogger } = require('./middleware/security');

const app = express();

// ============================================
// SECURITY LAYER 1: HTTP Security Headers (Helmet)
// Protects against XSS, clickjacking, MIME sniffing, etc.
// ============================================
app.use(securityHeaders);

// ============================================
// SECURITY LAYER 2: CORS Configuration
// Restricts which origins can access the API
// ============================================
app.use(cors({
  // Allow any localhost / 127.0.0.1 origin (any dev port: 5173, 5174, 4173…).
  // A single hardcoded origin silently blocks the browser when Vite picks a
  // different port or the user opens 127.0.0.1 instead of localhost — then
  // axios gets NO response at all and the login page shows the generic
  // "Login failed. Please try again." even though credentials were correct.
  origin: (origin, cb) => {
    if (
      !origin || // same-origin / curl / Postman
      /^http:\/\/localhost:\d+$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
    ) return cb(null, true);
    return cb(null, false); // other origins: no CORS headers → browser blocks
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// ============================================
// SECURITY LAYER 3: Body Parsing with Size Limits
// Prevents large payload attacks
// ============================================
app.use(express.json({ limit: '10kb' })); // Limit JSON body to 10kb
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ============================================
// SECURITY LAYER 4: Request Logging (Morgan)
// Logs all requests for auditing
// ============================================
app.use(morgan('dev'));

// ============================================
// SECURITY LAYER 5: Input Sanitization
// Removes control characters and null bytes
// ============================================
app.use(sanitizeInput);

// ============================================
// SECURITY LAYER 7: Audit Logging
// Logs all requests for security forensics
// ============================================
app.use(auditLogger);

// static uploads (with size limit)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ============================================
// HEALTH CHECK (no auth required)
// ============================================
app.get('/api/health', (req, res) => res.json({ 
  ok: true, 
  service: 'SIPMS API',
  timestamp: new Date().toISOString(),
  security: 'active'
}));

// ============================================
// API ROUTES WITH RATE LIMITING
// Auth routes get stricter rate limiting
// ============================================
app.use('/api/auth', authLimiter, require('./routes/auth.routes'));
app.use('/api/student',     apiLimiter, require('./routes/student.routes'));
app.use('/api/department',  apiLimiter, require('./routes/department.routes'));
app.use('/api/college',     apiLimiter, require('./routes/college.routes'));
app.use('/api/academic-vp', apiLimiter, require('./routes/academicVP.routes'));
app.use('/api/admin-vp',    apiLimiter, require('./routes/adminVP.routes'));
app.use('/api/finance',     apiLimiter, require('./routes/finance.routes'));
app.use('/api/admin',       apiLimiter, require('./routes/admin.routes'));
app.use('/api/feedback',    apiLimiter, require('./routes/feedback.routes'));
app.use('/api/messages',    apiLimiter, require('./routes/message.routes'));

// ============================================
// GLOBAL ERROR HANDLER (Security: no stack traces in production)
// ============================================
app.use(errorHandler);

module.exports = app;
