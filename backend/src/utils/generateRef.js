const crypto = require('crypto');
module.exports = () =>
  `TB-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
