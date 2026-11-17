const crypto = require('crypto');

// Generates a 6-digit numeric OTP (e.g. "483920").
// NOTE: academic simulation — a real deployment would send this via
// TeleBirr / SMS gateway to the student's phone instead of returning it.
exports.generateOtp = () =>
  String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

// OTP is valid for 5 minutes.
exports.OTP_TTL_MS = 5 * 60 * 1000;
