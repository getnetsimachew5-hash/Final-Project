const jwt  = require('jsonwebtoken');
const User = require('../models/User');

exports.verifyJWT = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'No token' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select('-passwordHash');
    if (!user) return res.status(401).json({ message: 'Invalid or inactive account' });

    // Token is valid, but access is still gated: the account must have been
    // approved by an administrator (accountStatus === 'active').
    if (user.accountStatus === 'suspended') {
      return res.status(401).json({ message: 'Account is suspended' });
    }
    if (user.accountStatus !== 'active') {
      return res.status(403).json({
        message: 'Your account is awaiting administrator approval',
        needsApproval: true,
      });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Token invalid or expired' });
  }
};
