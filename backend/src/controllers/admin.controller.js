const User            = require('../models/User');
const AuditLog        = require('../models/AuditLog');
const Notification    = require('../models/Notification');
const Batch           = require('../models/PaymentBatch');
const Organization    = require('../models/Organization');
const PaymentRequest  = require('../models/PaymentRequest');

// Roles the administrator may create or assign. `industrial` is intentionally
// excluded: the legacy accounts are suspended and no new one may be created.
const ASSIGNABLE_ROLES = [
  'student', 'cs_dept', 'college', 'academic_vp', 'admin_vp', 'finance', 'admin',
];

/**
 * ============================================
 * ADMIN ACTOR CONTROLLER
 * ============================================
 * The System Administrator manages users and system settings.
 * Functions:
 * - Register/login
 * - Manage all users (approve, reject, update, delete)
 * - View system audit logs
 * - View system statistics
 * - Manage organizations
 * - Backup database
 * - System configuration
 */

// ============================================
// USER MANAGEMENT
// ============================================

/**
 * Create a new user (Admin adds users to the system directly).
 * The admin provides full identity fields + an initial password.
 * Students created here are activated immediately so they can log in.
 */
exports.createUser = async (req, res) => {
  try {
    const fullName        = String(req.body.fullName || '').trim();
    const institutionalId = String(req.body.institutionalId || '').trim();
    const username        = String(req.body.username || '').trim().toLowerCase();
    const email           = String(req.body.email || '').trim().toLowerCase();
    const phone           = String(req.body.phone || '').trim();
    const password        = String(req.body.password || '').trim();
    const { role, program, year } = req.body;

    if (!fullName || !institutionalId || !username || !password) {
      return res.status(400).json({
        message: 'Full name, University ID, username and password are required',
      });
    }
    if (!role) return res.status(400).json({ message: 'Role is required' });
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ message: 'That role is not available' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const yearNumber = Number(year);
    if (role === 'student' && (!year || !Number.isInteger(yearNumber) || yearNumber < 1 || yearNumber > 7)) {
      return res.status(400).json({ message: 'Year of study is required for students (choose 1–7)' });
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email))
      return res.status(400).json({ message: 'Invalid email address' });
    if (phone && !/^\+?\d{9,15}$/.test(phone.replace(/[\s-]/g, '')))
      return res.status(400).json({ message: 'Invalid phone number (use 9–15 digits)' });
    if (!/\d{3,}/.test(institutionalId))
      return res.status(400).json({
        message: 'University ID must contain at least 3 digits (e.g. WCU1501410)',
      });

    // Duplicate checks (same rules as public registration)
    const duplicate = await User.findOne({
      $or: [
        { username },
        { institutionalId },
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone }] : []),
      ],
    }).select('username institutionalId email phone');
    if (duplicate) {
      const field = ['username', 'institutionalId', 'email', 'phone']
        .find(f => duplicate[f] &&
          String(duplicate[f]).toLowerCase() ===
            String({ username, institutionalId, email, phone }[f]).toLowerCase());
      return res.status(409).json({
        message: `The ${field === 'institutionalId' ? 'University ID' : field} is already registered`,
      });
    }

    const user = await User.create({
      fullName,
      institutionalId,
      username,
      email: email || undefined,
      phone: phone || undefined,
      role,
      program,
      ...(role === 'student' ? { year: yearNumber } : {}),
      passwordHash: password,
      accountStatus: 'active',
      verifiedIdentity: role === 'student',
    });

    await Notification.create({
      recipient: user._id,
      message: `👋 Welcome ${fullName}! The administrator created your SIPMS account (${role}). Username: ${username}.`,
      type: 'account',
    });

    await AuditLog.create({
      user: req.user._id,
      action: 'create_user',
      targetId: user._id,
      targetType: 'User',
      meta: { fullName, role, institutionalId },
    });

    const created = user.toObject();
    delete created.passwordHash;

    res.status(201).json({
      message: `User "${fullName}" created successfully. They can log in with username: ${username}`,
      user: created,
    });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue || {})[0] || 'field';
      return res.status(409).json({
        message: `That ${field === 'institutionalId' ? 'University ID' : field} is already registered`,
      });
    }
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Failed to create user' });
  }
};

/**
 * Get all users
 */
exports.listUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-passwordHash')
      .sort('-createdAt');
    
    // Add login status info
    const usersWithStatus = users.map(u => ({
      ...u.toObject(),
      canLogin: u.role === 'student' 
        ? u.verifiedIdentity && u.accountStatus !== 'suspended'
        : u.accountStatus === 'active',
      loginStatus: getLoginStatus(u),
    }));

    res.json(usersWithStatus);
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ message: 'Failed to load users' });
  }
};

/**
 * Get users who cannot log in
 */
exports.notLoggedInUsers = async (req, res) => {
  try {
    const notLoggedIn = await User.find({
      $or: [
        // Staff/office users not activated
        { role: { $nin: ['student'] }, accountStatus: { $ne: 'active' } },
        // Students: unverified OR suspended
        { role: 'student', verifiedIdentity: false },
        { role: 'student', accountStatus: 'suspended' },
      ],
    }).select('-passwordHash').sort('-createdAt');

    const total = await User.countDocuments();

    res.json({
      users: notLoggedIn,
      summary: {
        totalUsers: total,
        cannotLogin: notLoggedIn.length,
        pendingApproval: notLoggedIn.filter(u => u.role !== 'student' && u.accountStatus === 'pending').length,
        unverifiedStudents: notLoggedIn.filter(u => u.role === 'student' && !u.verifiedIdentity).length,
        suspended: notLoggedIn.filter(u => u.accountStatus === 'suspended').length,
      },
    });
  } catch (error) {
    console.error('Not logged in users error:', error);
    res.status(500).json({ message: 'Failed to load users' });
  }
};

/**
 * Get pending users (awaiting approval)
 */
exports.pendingUsers = async (req, res) => {
  try {
    const pendingUsers = await User.find({ accountStatus: 'pending' })
      .select('-passwordHash')
      .sort('-createdAt');

    res.json(pendingUsers);
  } catch (error) {
    console.error('Pending users error:', error);
    res.status(500).json({ message: 'Failed to load pending users' });
  }
};

/**
 * Approve user - activate account
 */
exports.approveUser = async (req, res) => {
  try {
    const target = await User.findById(req.params.id).select('role');
    if (!target) {
      return res.status(404).json({ message: 'User not found' });
    }

    const update = { accountStatus: 'active' };
    // A student can only log in once their identity is verified, so
    // approving a student must flip that flag as well.
    if (target.role === 'student') update.verifiedIdentity = true;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      update,
      { returnDocument: 'after' }
    ).select('-passwordHash');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Send notification to user
    await Notification.create({
      recipient: user._id,
      message: '✅ Your account has been approved by the administrator. You can now log in to SIPMS.',
      type: 'account',
    });

    await AuditLog.create({
      user: req.user._id,
      action: 'approve_user',
      targetId: user._id,
      targetType: 'User',
    });

    res.json({
      message: 'User approved successfully',
      user,
    });
  } catch (error) {
    console.error('Approve user error:', error);
    res.status(500).json({ message: 'Failed to approve user' });
  }
};

/**
 * Reject/suspend user
 */
exports.rejectUser = async (req, res) => {
  try {
    const { reason } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { accountStatus: 'suspended' },
      { returnDocument: 'after' }
    ).select('-passwordHash');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Send notification to user
    await Notification.create({
      recipient: user._id,
      message: `❌ Your account registration was rejected. ${reason || 'Contact the registrar office for details.'}`,
      type: 'account',
    });

    await AuditLog.create({
      user: req.user._id,
      action: 'reject_user',
      targetId: user._id,
      targetType: 'User',
      meta: { reason },
    });

    res.json({
      message: 'User suspended',
      user,
    });
  } catch (error) {
    console.error('Reject user error:', error);
    res.status(500).json({ message: 'Failed to suspend user' });
  }
};

/**
 * Verify student identity - allow student to login
 */
exports.verifyStudent = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { verifiedIdentity: true, accountStatus: 'active' },
      { returnDocument: 'after' }
    ).select('-passwordHash');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role !== 'student') {
      return res.status(400).json({ message: 'Only students can be identity-verified' });
    }

    // Send notification to student
    await Notification.create({
      recipient: user._id,
      message: '✅ Your identity has been verified by the administrator. You can now log in to SIPMS.',
      type: 'account',
    });

    await AuditLog.create({
      user: req.user._id,
      action: 'verify_student',
      targetId: user._id,
      targetType: 'User',
      meta: { fullName: user.fullName, institutionalId: user.institutionalId },
    });

    res.json({
      message: 'Student identity verified. Account activated.',
      user,
    });
  } catch (error) {
    console.error('Verify student error:', error);
    res.status(500).json({ message: 'Failed to verify student' });
  }
};

/**
 * Update user information
 */
exports.updateUser = async (req, res) => {
  try {
    const allowed = {};
    for (const k of ['fullName', 'institutionalId', 'username', 'email', 'phone', 'role', 'accountStatus']) {
      if (req.body[k] !== undefined) {
        if (k === 'username') {
          allowed[k] = String(req.body[k]).trim().toLowerCase();
        } else if (k === 'email') {
          allowed[k] = String(req.body[k]).trim().toLowerCase();
        } else {
          allowed[k] = String(req.body[k]).trim();
        }
      }
    }

    // Validate institutional ID if provided
    if (allowed.institutionalId && !/\d{3,}/.test(allowed.institutionalId)) {
      return res.status(400).json({
        message: 'University ID must contain at least 3 digits'
      });
    }

    if (allowed.role && !ASSIGNABLE_ROLES.includes(allowed.role)) {
      const target = await User.findById(req.params.id).select('role');
      const keepingLegacyRole = target?.role === allowed.role && target.role === 'industrial';
      if (!keepingLegacyRole) {
        return res.status(400).json({ message: 'That role is not available' });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      allowed,
      { returnDocument: 'after', runValidators: true }
    ).select('-passwordHash');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await AuditLog.create({
      user: req.user._id,
      action: 'update_user',
      targetId: user._id,
      targetType: 'User',
      meta: { fields: Object.keys(allowed) },
    });

    res.json({
      message: 'User updated successfully',
      user,
    });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue || {})[0] || 'field';
      return res.status(409).json({
        message: `That ${field === 'institutionalId' ? 'University ID' : field} is already in use`
      });
    }
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Failed to update user' });
  }
};

/**
 * Delete a user permanently
 * Safety rules:
 * - An admin can never delete their own account (prevents lockout)
 * - An admin can never delete another admin account
 */
exports.deleteUser = async (req, res) => {
  try {
    if (req.params.id === String(req.user._id)) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    const user = await User.findById(req.params.id).select('-passwordHash');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Admin accounts cannot be deleted. Suspend the account instead.' });
    }

    await User.deleteOne({ _id: user._id });

    // Keep the user's notifications from referencing a deleted user
    await Notification.deleteMany({ recipient: user._id });

    await AuditLog.create({
      user: req.user._id,
      action: 'delete_user',
      targetId: user._id,
      targetType: 'User',
      meta: { fullName: user.fullName, role: user.role, institutionalId: user.institutionalId },
    });

    res.json({
      message: `User "${user.fullName}" deleted permanently`,
      userId: user._id,
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Failed to delete user' });
  }
};

/**
 * Get single user details
 */
exports.getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-passwordHash');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get user's activity
    const activities = await AuditLog.find({ user: user._id })
      .sort('-at')
      .limit(20);

    res.json({
      user,
      activities,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Failed to load user' });
  }
};

// ============================================
// AUDIT LOGS
// ============================================

/**
 * Get audit logs
 */
exports.auditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, action, user, startDate, endDate } = req.query;

    const filter = {};
    if (action) filter.action = { $regex: action, $options: 'i' };
    if (user) filter.user = user;
    if (startDate || endDate) {
      filter.at = {};
      if (startDate) filter.at.$gte = new Date(startDate);
      if (endDate) filter.at.$lte = new Date(endDate);
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, parseInt(limit) || 50);
    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('user', 'fullName role username')
        .sort('-at')
        .skip(skip)
        .limit(limitNum),
      AuditLog.countDocuments(filter),
    ]);

    // Return pagination metadata together with the page of logs so the admin
    // portal can show "page X of Y" and move between pages. The portal also
    // still accepts a bare array for backwards compatibility.
    res.json({
      logs,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.max(1, Math.ceil(total / limitNum)),
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ message: 'Failed to load audit logs' });
  }
};

/**
 * Get audit log statistics
 */
exports.getAuditStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const timeFilter = {};
    if (startDate || endDate) {
      timeFilter.at = {};
      if (startDate) timeFilter.at.$gte = new Date(startDate);
      if (endDate) timeFilter.at.$lte = new Date(endDate);
    }

    const [
      totalEvents,
      byAction,
      byUser,
      recentActivity,
    ] = await Promise.all([
      AuditLog.countDocuments(timeFilter),
      AuditLog.aggregate([
        { $match: timeFilter },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      AuditLog.aggregate([
        { $match: timeFilter },
        { $group: { _id: '$user', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      AuditLog.find(timeFilter)
        .populate('user', 'fullName role')
        .sort('-at')
        .limit(20),
    ]);

    res.json({
      totalEvents,
      byAction,
      topUsers: byUser,
      recentActivity,
    });
  } catch (error) {
    console.error('Get audit stats error:', error);
    res.status(500).json({ message: 'Failed to load audit statistics' });
  }
};

// ============================================
// SYSTEM STATISTICS
// ============================================

/**
 * Get system-wide statistics
 */
exports.getStats = async (req, res) => {
  try {
    const [
      totalUsers,
      pendingUsers,
      activeUsers,
      students,
      csDept,
      college,
      academicVp,
      adminVp,
      finance,
      totalBatches,
      draftBatches,
      pendingBatches,
      paidBatches,
      rejectedBatches,
      totalOrganizations,
      totalPayments,
      totalPaymentAmount,
      todayPayments,
      todayPaymentAmount,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ accountStatus: 'pending' }),
      User.countDocuments({ accountStatus: 'active' }),
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: 'cs_dept' }),
      User.countDocuments({ role: 'college' }),
      User.countDocuments({ role: 'academic_vp' }),
      User.countDocuments({ role: 'admin_vp' }),
      User.countDocuments({ role: 'finance' }),
      Batch.countDocuments(),
      Batch.countDocuments({ status: 'draft' }),
      Batch.countDocuments({ 
        status: { 
          $in: ['pending_college', 'pending_academic_vp', 'pending_admin_vp', 
                 'pending_finance'] 
        } 
      }),
      Batch.countDocuments({ status: 'paid' }),
      Batch.countDocuments({ status: 'rejected' }),
      Organization.countDocuments(),
      PaymentRequest.countDocuments({ status: 'paid' }),
      PaymentRequest.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      PaymentRequest.countDocuments({
        status: 'paid',
        updatedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
      PaymentRequest.aggregate([
        { $match: { status: 'paid', updatedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    res.json({
      users: {
        total: totalUsers,
        pending: pendingUsers,
        active: activeUsers,
        byRole: {
          student: students,
          cs_dept: csDept,
          college,
          academic_vp: academicVp,
          admin_vp: adminVp,
          finance,
        },
      },
      batches: {
        total: totalBatches,
        draft: draftBatches,
        pending: pendingBatches,
        paid: paidBatches,
        rejected: rejectedBatches,
      },
      organizations: totalOrganizations,
      payments: {
        total: totalPayments,
        totalAmount: totalPaymentAmount?.[0]?.total || 0,
        today: todayPayments,
        todayAmount: todayPaymentAmount?.[0]?.total || 0,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: 'Failed to load statistics' });
  }
};

// ============================================
// ORGANIZATION MANAGEMENT (for Admin)
// ============================================

/**
 * Get all organizations
 */
exports.getOrganizations = async (req, res) => {
  try {
    const organizations = await Organization.find()
      .populate('addedBy', 'fullName')
      .sort('-createdAt');

    res.json({ organizations });
  } catch (error) {
    console.error('Get organizations error:', error);
    res.status(500).json({ message: 'Failed to load organizations' });
  }
};

/**
 * Delete organization
 */
exports.deleteOrganization = async (req, res) => {
  try {
    const organization = await Organization.findByIdAndDelete(req.params.id);

    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    await AuditLog.create({
      user: req.user._id,
      action: 'delete_organization',
      targetId: organization._id,
      targetType: 'Organization',
      meta: { orgName: organization.orgName },
    });

    res.json({
      message: 'Organization deleted',
      organization,
    });
  } catch (error) {
    console.error('Delete organization error:', error);
    res.status(500).json({ message: 'Failed to delete organization' });
  }
};

// ============================================
// BACKUP
// ============================================

/**
 * Database backup
 */
exports.backup = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const collections = mongoose.connection.collections;
    const dump = {};
    
    for (const [name, col] of Object.entries(collections)) {
      dump[name] = await col.find({}).toArray();
    }
    
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="sipms-backup-${stamp}.json"`);
    res.send(JSON.stringify({ 
      exportedAt: new Date(), 
      database: mongoose.connection.name, 
      data: dump 
    }, null, 2));

    await AuditLog.create({
      user: req.user._id, 
      action: 'backup_database',
      targetType: 'Database',
    });
  } catch (error) {
    console.error('Backup error:', error);
    res.status(500).json({ message: 'Failed to create backup' });
  }
};

// ============================================
// HELPERS
// ============================================

function getLoginStatus(user) {
  if (user.accountStatus === 'suspended') return 'suspended';
  if (user.role === 'student') {
    return user.verifiedIdentity ? 'verified' : 'unverified';
  }
  return user.accountStatus;
}
