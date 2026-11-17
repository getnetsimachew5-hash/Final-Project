const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

/**
 * ============================================
 * SECURITY MIDDLEWARE FOR SIPMS
 * ============================================
 * This module implements multiple layers of defense:
 * 
 * 1. HELMET - Sets HTTP security headers
 * 2. RATE LIMITING - Prevents brute force & DDoS
 * 3. XSS CLEANING - Prevents cross-site scripting
 * 4. INPUT VALIDATION - Sanitizes all user input
 * 5. AUTHENTICATION - JWT-based auth with refresh
 * 6. AUTHORIZATION - Role-based access control (RBAC)
 * 7. AUDIT LOGGING - Tracks all actions for forensics
 */

// ============================================
// 1. HELMET CONFIGURATION
// Sets various HTTP headers to protect against common vulnerabilities
// ============================================
exports.securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "http://localhost:5173"],
      styleSrc: ["'self'", "'unsafe-inline'", "http://localhost:5173"],
      imgSrc: ["'self'", "data:", "http:", "https:"],
      connectSrc: ["'self'", "http://localhost:5000", "http://localhost:5173"],
      fontSrc: ["'self'"],
      // Allow the browser's built-in PDF viewer to render completion letters.
      objectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  // Prevent MIME type sniffing
  crossOriginEmbedderPolicy: false,
  // Allow the uploaded letters (served from :5000) to be opened/loaded from
  // the frontend running on :5173. Without this, CORP 'same-origin' blocks them.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // Enable XSS filter in browsers
  xssFilter: true,
  // Prevent clickjacking
  frameguard: { action: 'sameorigin' },
  // Hide X-Powered-By header
  hidePoweredBy: true,
  // Restrict referrer information
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

// ============================================
// 2. RATE LIMITING
// Prevents brute force attacks on auth endpoints
// ============================================

// Strict-but-usable rate limit for login/register.
// IMPORTANT: successful requests do NOT count (skipSuccessfulRequests) — only
// failed attempts count, so a user who logs in normally can never be locked
// out by the maintenance/admin API polling hitting /api/auth. Previously the
// 10-requests-per-15-min cap counted EVERY request (even successful logins),
// which locked users out and produced misleading "Login failed" errors.
exports.authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 FAILED attempts per windowMs
  skipSuccessfulRequests: true,
  message: {
    message: 'Too many failed login attempts. Please try again later.',
    retryAfter: 15 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use X-Forwarded-For if behind proxy, otherwise remoteAddress
    return req.headers['x-forwarded-for'] || req.ip;
  },
});

// Moderate rate limit for general API endpoints.
// Successful requests are NOT counted, so browsing the portals can never use up
// the quota and block a real action (e.g. a completion-letter upload) later.
exports.apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skipSuccessfulRequests: true,
  message: { message: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limit for password reset and sensitive actions (5 per hour)
exports.sensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { message: 'Too many sensitive requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});



// ============================================
// 4. INPUT SANITIZATION MIDDLEWARE
// Sanitizes string inputs to prevent injection attacks
// ============================================
exports.sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      
      if (typeof value === 'string') {
        // Remove null bytes and control characters
        obj[key] = value.replace(/[\0\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        // Trim whitespace
        obj[key] = obj[key].trim();
      } else if (Array.isArray(value)) {
        obj[key] = value.map(item => 
          typeof item === 'string' ? item.replace(/[\0\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim() : item
        );
      } else if (typeof value === 'object' && value !== null) {
        sanitize(value);
      }
    }
    return obj;
  };

  if (req.body) sanitize(req.body);
  if (req.query) sanitize(req.query);
  if (req.params) sanitize(req.params);
  
  next();
};

// ============================================
// 5. AUTHENTICATION MIDDLEWARE (JWT)
// Verifies JWT tokens and attaches user to request
// ============================================
const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.verifyJWT = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    
    if (!token) {
      return res.status(401).json({ 
        message: 'Authentication required. Please log in.',
        code: 'NO_TOKEN'
      });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'], // Only allow HS256 algorithm
    });

    const user = await User.findById(payload.sub).select('-passwordHash');
    
    if (!user) {
      return res.status(401).json({ 
        message: 'Account not found. It may have been deleted.',
        code: 'USER_NOT_FOUND'
      });
    }

    // Access is gated purely by administrator approval (active account).
    if (user.accountStatus === 'suspended') {
      return res.status(403).json({ 
        message: 'Account is suspended. Contact administrator.',
        code: 'ACCOUNT_SUSPENDED'
      });
    }

    if (user.accountStatus !== 'active') {
      return res.status(403).json({ 
        message: 'Your account is awaiting administrator approval.',
        needsApproval: true,
        code: 'ACCOUNT_NOT_ACTIVE'
      });
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Session expired. Please log in again.',
        code: 'TOKEN_EXPIRED'
      });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        message: 'Invalid authentication token.',
        code: 'INVALID_TOKEN'
      });
    }
    console.error('JWT verification error:', err);
    return res.status(500).json({ message: 'Authentication error.' });
  }
};

// ============================================
// 6. ROLE-BASED ACCESS CONTROL (RBAC)
// Restricts access based on user roles
// ============================================
exports.requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        message: 'Authentication required.',
        code: 'NOT_AUTHENTICATED'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
        requiredRoles: allowedRoles,
        userRole: req.user.role,
        code: 'FORBIDDEN_ROLE'
      });
    }

    next();
  };
};

// ============================================
// 7. ADMIN-ONLY MIDDLEWARE
// Convenience wrapper for admin-only routes
// ============================================
exports.adminOnly = exports.requireRole('admin');

// ============================================
// 8. INPUT VALIDATION HELPERS
// Using express-validator for robust validation
// ============================================
const { body, param, query, validationResult } = require('express-validator');

exports.validationResult = validationResult;

// Common validation rules
exports.validators = {
  // Username: lowercase, alphanumeric + underscore, 3-30 chars
  username: body('username')
    .trim()
    .toLowerCase()
    .matches(/^[a-z0-9_]+$/)
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be 3-30 characters, lowercase letters/numbers/underscore only'),

  // Password: minimum 8 chars, must contain letters and numbers
  password: body('password')
    .trim()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/[A-Za-z]/)
    .withMessage('Password must contain at least one letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number'),

  // Email validation
  email: body('email')
    .trim()
    .toLowerCase()
    .isEmail()
    .withMessage('Invalid email address')
    .normalizeEmail(),

  // Phone validation (local or international). Local 09…/07… is accepted and
  // normalized to +251… by the registration/profile controllers.
  phone: body('phone')
    .trim()
    .matches(/^\+?\d{9,15}$/)
    .withMessage('Phone must be 9-15 digits; local (0911223344) and international (+251911223344) formats are both accepted'),

  // Institutional ID (must contain numbers)
  institutionalId: body('institutionalId')
    .trim()
    .matches(/\d{3,}/)
    .withMessage('University ID must contain at least 3 digits'),

  // Full name
  fullName: body('fullName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be 2-100 characters'),

  // Comment (for approvals/rejections)
  comment: body('comment')
    .trim()
    .isLength({ min: 5 })
    .withMessage('Comment must be at least 5 characters'),

  // Reason (for rejections)
  reason: body('reason')
    .trim()
    .isLength({ min: 5 })
    .withMessage('Reason must be at least 5 characters'),

  // Organization name
  orgName: body('orgName')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Organization name must be 2-200 characters'),

  // Organization address
  orgAddress: body('orgAddress')
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage('Organization address must be 5-500 characters'),
};

// ============================================
// 9. ERROR HANDLING MIDDLEWARE
// Catches and formats errors securely (no stack traces in production)
// ============================================
exports.errorHandler = (err, req, res, next) => {
  console.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.userId || 'unknown',
  });

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message,
    }));
    return res.status(400).json({ message: 'Validation failed', errors });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({ 
      message: `Duplicate value for ${field}. Please use a different value.`,
      field 
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ message: 'Invalid token.' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ message: 'Token expired.' });
  }

  // Custom application errors
  if (err.status) {
    return res.status(err.status).json({ 
      message: err.message,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
  }

  // Default error
  res.status(err.status || 500).json({
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

// ============================================
// 10. AUDIT LOGGING MIDDLEWARE
// Logs all requests for security forensics
// ============================================
exports.auditLogger = (req, res, next) => {
  const start = Date.now();
  
  // Capture response
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - start;
    const auditEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      userId: req.userId ? req.userId.toString() : null,
      userRole: req.user?.role || null,
      // Only log sensitive paths
      sensitive: ['/auth/login', '/auth/register', '/api/admin'].some(p => req.path.startsWith(p)),
    };
    
    // Log security-relevant events
    if (res.statusCode >= 400) {
      console.warn('[AUDIT]', JSON.stringify(auditEntry));
    }
    
    originalEnd.apply(res, args);
  };

  next();
};
