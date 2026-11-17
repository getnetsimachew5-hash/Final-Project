/* eslint-disable no-console */
// Fix seeded passwords: re-hash the plain-text password for existing staff accounts.
// Run: node fix-seed-passwords.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sipms';
const PASSWORD = 'Sipms@2026';

const STAFF_USERNAMES = [
  'admin', 'csdept', 'college', 'academicvp', 'adminvp', 'industrial', 'finance',
];

(async () => {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  for (const username of STAFF_USERNAMES) {
    const user = await User.findOne({ username });
    if (!user) {
      console.log(`✗ not found: ${username}`);
      continue;
    }

    // Check if the stored hash looks like a bcrypt hash (starts with $2a$, $2b$, or $2y$)
    const isBcryptHash = user.passwordHash?.startsWith?.('$2');
    if (isBcryptHash) {
      console.log(`✓ already hashed: ${username}`);
      continue;
    }

    // Re-hash the correct password
    user.passwordHash = passwordHash;
    await user.save();
    console.log(`✓ fixed: ${username} (${user.role}) — password now matches "${PASSWORD}"`);
  }

  await mongoose.disconnect();
  console.log('\nDone. All staff accounts now use bcrypt-hashed passwords.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
