const r = require('express').Router();
const { verifyJWT }   = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { validationResult } = require('express-validator');
const c = require('../controllers/finance.controller');
const telebirr = require('../services/telebirr.service');

r.use(verifyJWT, requireRole('finance'));

// View batches pending payment
r.get('/batches', c.viewBatches);

// Paid/pending overview for the Finance dashboard (all students per batch)
r.get('/overview', c.overview);

// Get batch payment details
r.get('/batches/:id', c.getBatchDetails);

// Guided workflow (functions 1–10)
r.get('/batches/:id/history', c.getBatchHistory);
r.get('/batches/:id/amount', c.getBatchAmount);
r.get('/batches/:id/session', c.getPaymentSession);
r.post('/batches/:id/review', c.reviewBatch);
r.post('/batches/:id/amount', c.confirmBatchAmount);
r.post('/batches/:id/mode', c.setPaymentMode);
r.post('/batches/:id/simulate', c.simulateBatchPayment);
r.post('/batches/:id/reference', c.generatePaymentReference);
r.post('/batches/:id/confirm', c.confirmBatchPayment);
r.post('/batches/:id/paid', c.markBatchPaid);
r.post('/batches/:id/finalize', c.finalizeBatch);
r.post('/batches/:id/report', c.markReportGenerated);

// Pay ENTIRE batch — all students simultaneously (auto TeleBirr + notifications)
r.post('/batches/:id/pay-all', c.payEntireBatch);

// (kept for compatibility)
r.post('/batches/:id/process', c.payEntireBatch);

// Payment settings (daily rate)
r.get('/settings', c.getSettings);
r.patch('/settings', c.updateSettings);

// Confirm a transaction with its OTP (Finance portal modal)
r.post('/transactions/:txnId/confirm', c.confirmTransaction);

// View all payment requests
r.get('/requests', c.viewRequests);

// Get request details
r.get('/requests/:id', c.getRequestDetails);

// Calculate payment amount
r.get('/requests/:id/calculate', c.calculateAmount);

// Process individual payment
r.post('/requests/:id/process', c.processPayment);

// Confirm payment with OTP (called by student)
r.post('/requests/:id/confirm', c.confirmPayment);

// Verify OTP
r.post('/requests/:id/verify-otp', c.verifyOtp);

// Resend OTP
r.post('/requests/:id/resend-otp', c.resendOtp);

// Get payment history
r.get('/history', c.getPaymentHistory);

// Get payment report
r.get('/report', c.getPaymentReport);

// Get dashboard statistics
r.get('/stats', c.getStats);

module.exports = r;
