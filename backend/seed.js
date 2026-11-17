/* eslint-disable no-console */
// One-off seed: creates staff accounts (active) + sample feedback board entries.
// Run:  node seed.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');
const Feedback = require('./src/models/Feedback');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sipms';

const STAFF = [
  { fullName: 'System Administrator', institutionalId: 'WCU-ADMIN-001',  username: 'admin',       role: 'admin',       email: 'admin@wcu.edu.et' },
  { fullName: 'CS Department Officer',institutionalId: 'WCU-CS-001',     username: 'csdept',      role: 'cs_dept',     email: 'csdept@wcu.edu.et' },
  { fullName: 'College Office',       institutionalId: 'WCU-COL-001',    username: 'college',     role: 'college',     email: 'college@wcu.edu.et' },
  { fullName: 'Academic VP Office',   institutionalId: 'WCU-AVP-001',    username: 'academicvp',  role: 'academic_vp', email: 'academicvp@wcu.edu.et' },
  { fullName: 'Administrative VP',    institutionalId: 'WCU-AVP2-001',   username: 'adminvp',     role: 'admin_vp',    email: 'adminvp@wcu.edu.et' },
  { fullName: 'Finance Office',       institutionalId: 'WCU-FIN-001',    username: 'finance',     role: 'finance',     email: 'finance@wcu.edu.et' },
];

const PASSWORD = 'Sipms@2026';

/** Hash a plain-text password with bcrypt (same cost as the User model). */
function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

const SAMPLE_FEEDBACK = [
  { name: 'Hanna T.', role: 'student', kind: 'comment',
    message: 'The online return form saved me two trips to campus. Very smooth process!' },
  { name: 'Anonymous', role: 'anonymous', kind: 'complaint',
    message: 'Payment confirmation took longer than expected this semester. Please speed up the finance stage.' },
  { name: 'Organization Supervisor', role: 'visitor', kind: 'suggestion',
    message: 'It would help organizations if students could attach their attendance sheet too.' },
];

(async () => {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // --- Staff users ---
  const passwordHash = await hashPassword(PASSWORD);
  for (const s of STAFF) {
    const exists = await User.findOne({ username: s.username });
    if (exists) { console.log(`• exists: ${s.username} (${s.role})`); continue; }
    await User.create({ ...s, passwordHash, accountStatus: 'active' });
    console.log(`✓ created: ${s.username} (${s.role})`);
  }

  // --- Sample feedback (only first run) ---
  const fbCount = await Feedback.countDocuments();
  if (fbCount === 0) {
    await Feedback.insertMany(SAMPLE_FEEDBACK);
    console.log(`✓ inserted ${SAMPLE_FEEDBACK.length} sample feedback entries`);
  }

  await mongoose.disconnect();

  console.log('\n================ LOGIN ACCOUNTS ================');
  console.log('Password for ALL accounts: Sipms@2026');
  console.log('------------------------------------------------');
  console.log('admin      — System Administrator      (admin portal)');
  console.log('csdept     — CS Department             (approve flow)');
  console.log('college    — College Office            (approve flow)');
  console.log('academicvp — Academic VP Office        (approve flow)');
  console.log('adminvp    — Administrative VP Office  (authorize → Finance)');
  console.log('finance    — Finance Office            (TeleBirr pay)');
  console.log('================================================');
  console.log('Students: register via /register, then admin approves.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
