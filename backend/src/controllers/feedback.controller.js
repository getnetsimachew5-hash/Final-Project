const Feedback = require('../models/Feedback');

const VALID_ROLES = [
  'student', 'cs_dept', 'college', 'academic_vp',
  'admin_vp', 'finance', 'admin', 'staff', 'visitor'
];

// GET /api/feedback — public board (newest first)
exports.list = async (req, res) => {
  const list = await Feedback.find({ hidden: false })
    .populate('repliedBy', 'fullName role')
    .sort('-createdAt')
    .limit(100);
  res.json(list);
};

// POST /api/feedback — anyone (visitor, student, staff, any actor) can post complaints/comments
exports.create = async (req, res) => {
  try {
    const { name, role, kind, category, message } = req.body;
    if (!message || !message.trim())
      return res.status(400).json({ message: 'Message is required' });

    const fb = await Feedback.create({
      name: (name || '').trim() || 'Anonymous',
      role: VALID_ROLES.includes(role) ? role : 'anonymous',
      kind: ['complaint', 'comment', 'suggestion'].includes(kind) ? kind : 'comment',
      category: (category || 'General').trim(),
      message: message.trim().slice(0, 1000),
    });
    res.status(201).json(fb);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

