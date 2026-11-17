/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sipms';

// Change this to the password the student is trying to use
const NEW_PASSWORD = 'Student@123';   // ← set the password you want

(async () => {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const students = await User.find({ role: 'student' });
  console.log(`Found ${students.length} students`);

  for (const user of students) {
    // Force a clean bcrypt hash
    user.passwordHash = NEW_PASSWORD;   // pre-save hook will hash it
    await user.save();

    console.log(`✓ Fixed: ${user.username}  (${user.fullName})  → password = "${NEW_PASSWORD}"`);
  }

  await mongoose.disconnect();
  console.log('\nDone. Students can now login with the new password.');
  process.exit(0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});