/* eslint-disable no-console */
/*
 * One-off migration: retire the Industrial Linkage stage.
 *
 * Any batch, payment request, or return form still parked at
 * `pending_industrial` is moved directly to Finance (`pending_finance`).
 * Legacy Industrial accounts are suspended so they can no longer log in.
 *
 * Run once after deploying the code change:
 *   node migrate-remove-industrial.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Batch    = require('./src/models/PaymentBatch');
const Request  = require('./src/models/PaymentRequest');
const Return   = require('./src/models/InternshipReturn');
const User     = require('./src/models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sipms';

(async () => {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const batches = await Batch.find({ status: 'pending_industrial' }).select('_id batchName');
  if (batches.length) {
    await Batch.updateMany(
      { _id: { $in: batches.map((b) => b._id) } },
      { $set: { status: 'pending_finance' } }
    );
    console.log(`✓ moved ${batches.length} batch(es) to pending_finance`);
    for (const batch of batches) console.log(`   • ${batch.batchName}`);
  }

  const requestResult = await Request.updateMany(
    { status: 'pending_industrial' },
    { $set: { status: 'pending_finance' } }
  );
  console.log(`✓ moved ${requestResult.modifiedCount} payment request(s) to pending_finance`);

  const returnResult = await Return.updateMany(
    { status: 'pending_industrial' },
    { $set: { status: 'pending_finance' } }
  );
  console.log(`✓ moved ${returnResult.modifiedCount} return form(s) to pending_finance`);

  const userResult = await User.updateMany(
    { role: 'industrial', accountStatus: { $ne: 'suspended' } },
    { $set: { accountStatus: 'suspended' } }
  );
  console.log(`✓ suspended ${userResult.modifiedCount} legacy Industrial account(s)`);

  await mongoose.disconnect();
  console.log('\nMigration complete.');
  process.exit(0);
})().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
