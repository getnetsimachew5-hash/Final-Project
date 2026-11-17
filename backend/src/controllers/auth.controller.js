const jwt  = require('jsonwebtoken');
const User = require('../models/User');
const { normalizePhone } = require('../utils/paymentPhone');

const sign = (u) => jwt.sign(
  { sub: u._id, role: u.role },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
);

// Industrial Linkage has been retired; it must not be selectable at sign-up.
const REGISTER_ROLES = [
  'student', 'cs_dept', 'college', 'academic_vp', 'admin_vp', 'finance',
];

exports.register = async (req, res) => {
  // Normalize: trim whitespace on all identity fields.
  const fullName        = String(req.body.fullName || '').trim();
  const institutionalId = String(req.body.institutionalId || '').trim();
  const username        = String(req.body.username || '').trim().toLowerCase();
  const email           = String(req.body.email || '').trim().toLowerCase();
  const phoneRaw        = String(req.body.phone || '').trim();
  // Store one canonical format: local 09…/07… and +251… both become +251…
  const phone           = normalizePhone(phoneRaw);
  const password        = String(req.body.password || '').trim();
  const role = req.body.role;
  const { program, year } = req.body;

  // Required fields — students MUST provide ID, username, email and phone
  if (!fullName || !institutionalId || !username || !password) {
    return res.status(400).json({
      message: 'Full name, University ID, username and password are required',
    });
  }
  if (!REGISTER_ROLES.includes(role)) {
    return res.status(400).json({ message: 'Please select a valid role', field: 'role' });
  }
  if (role === 'student' && (!email || !phone)) {
    return res.status(400).json({
      message: 'Email and phone number are mandatory for students',
    });
  }

  // Year of study replaced the old semester field on the registration form.
  // A student registration is incomplete without a year from 1 to 7.
  const yearNumber = Number(year);
  if (role === 'student' && (!year || !Number.isInteger(yearNumber) || yearNumber < 1 || yearNumber > 7)) {
    return res.status(400).json({
      message: 'Year of study is required (choose 1–7)',
      field: 'year',
    });
  }

  if (email && !/^\S+@\S+\.\S+$/.test(email))
    return res.status(400).json({ message: 'Invalid email address' });
  if (phone && !/^\+?\d{9,15}$/.test(phone.replace(/[\s-]/g, '')))
    return res.status(400).json({ message: 'Invalid phone number. Use 9–15 digits — local (0911223344) and international (+251911223344) formats are both accepted.' });

  // University ID must contain digits
  if (!/\d{3,}/.test(institutionalId)) {
    return res.status(400).json({
      message: 'University ID must be your personal ID number from your student card (e.g. WCU1501410) — not the university name',
      field: 'institutionalId',
    });
  }

  // Check duplicates
  const duplicate = async (field, value) =>
    value && await User.findOne({ [field]: value }).select('_id');

  if (await duplicate('username', username))
    return res.status(409).json({
      message: `Username "${username}" is already taken — please choose a different one`,
      field: 'username',
    });
  if (await duplicate('institutionalId', institutionalId))
    return res.status(409).json({
      message: `University ID "${institutionalId}" is already registered — every student studies at the same university, but each one has their OWN personal ID number from their student card (e.g. WCU1501410). Do not type the university name here.`,
      field: 'institutionalId',
    });
  if (await duplicate('email', email))
    return res.status(409).json({
      message: `Email "${email}" is already registered — each account needs a unique email`,
      field: 'email',
    });
  // Compare every common spelling of the same number (local vs international)
  // so the same phone cannot be registered twice in two formats.
  const phoneVariants = [...new Set([
    phone,
    phoneRaw,
    phone.replace(/^\+251/, '0'),
    phone.replace(/^\+251/, ''),
  ].filter(Boolean))];
  if (phoneVariants.length && await User.findOne({ phone: { $in: phoneVariants } }).select('_id'))
    return res.status(409).json({
      message: `Phone number "${phoneRaw}" is already registered — each student must use their own phone`,
      field: 'phone',
    });

  try {
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
      // EVERY new account starts as PENDING — nobody can log in until an
      // administrator approves the account. Students are activated by the
      // admin's "Verify & Activate" action (which sets verifiedIdentity too);
      // staff roles by "Approve".
      accountStatus: 'pending',
      verifiedIdentity: false,
    });

    return res.status(201).json({
      message: 'Registration successful! Your account is awaiting administrator approval. You will be able to log in once an administrator verifies your account.',
      userId: user._id,
      pendingApproval: true,
    });
  } catch (e) {
    if (e.code === 11000) {
      const f = Object.keys(e.keyValue || {})[0] || 'field';
      return res.status(409).json({
        message: `That ${f === 'institutionalId' ? 'University ID' : f} is already registered`,
        field: f,
      });
    }
    throw e;
  }
};

exports.login = async (req, res) => {
  const raw      = String(req.body.username || '').trim();
  const username = raw.toLowerCase();
  const password = String(req.body.password || '').trim();

  if (!raw || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  // Allow signing in with EITHER the username, the University ID, or the email
  // address — students often type the wrong one and think login is broken.
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const user = await User.findOne({
    $or: [
      { username },
      { username: raw },
      { email: username },
      { institutionalId: new RegExp(`^${escapeRe(raw)}$`, 'i') },
    ],
  });
  if (!user) {
    return res.status(401).json({
      message: 'No account found with those details. Please check your username, University ID or email.',
    });
  }

  // Debug helper (you can remove later)
  const isHash = user.passwordHash?.startsWith?.('$2');
  if (!isHash) {
    console.warn(`[LOGIN] User "${username}" has UNHASHED password – this will fail`);
  }

  const match = await user.comparePassword(password);
  if (!match) {
    return res.status(401).json({
      message: 'Incorrect password. Please use the exact password you registered with.',
    });
  }

  // Account status checks — NO automatic activation. An administrator must
  // approve (activate) the account first, otherwise the user cannot log in.
  if (user.accountStatus === 'suspended') {
    return res.status(403).json({
      message: 'Account is suspended. Contact the system administrator.',
      accountStatus: user.accountStatus,
    });
  }

  if (user.accountStatus !== 'active') {
    return res.status(403).json({
      message: user.role === 'student'
        ? 'Your account is awaiting administrator approval. Please try again once the administrator verifies your account.'
        : `Account is ${user.accountStatus}. Please contact the administrator.`,
      accountStatus: user.accountStatus,
      pendingApproval: true,
    });
  }

  res.json({
    token: sign(user),
    user: {
      id: user._id,
      fullName: user.fullName,
      role: user.role,
      username: user.username,
      institutionalId: user.institutionalId,
      email: user.email || '',
      phone: user.phone || '',
      program: user.program || '',
      year: user.year || null,
      semester: user.semester || '',
      department: user.department || '',
      verifiedIdentity: user.verifiedIdentity ?? false,
      accountStatus: user.accountStatus,
    },
  });
};

exports.me = async (req, res) => {
  const u = req.user.toObject();
  res.json({
    user: {
      ...u,
      verifiedIdentity: u.verifiedIdentity ?? false,
      canLogin: u.role === 'student' ? u.verifiedIdentity : u.accountStatus === 'active',
    },
  });
};

// --- helpers for typo suggestion ---
const sortedLetters = (s) => s.split('').sort().join('');

function oneEditApart(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return true;
}

async function findSimilarUsername(input) {
  const names = (await User.find().select('username -_id')).map(u => u.username);
  const s = sortedLetters(input);
  return names.find(n => n !== input && sortedLetters(n) === s)
      || names.find(n => oneEditApart(n, input));
}