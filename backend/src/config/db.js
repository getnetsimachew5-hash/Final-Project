const mongoose = require('mongoose');

module.exports = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected');

    // Older databases have a UNIQUE index on PaymentBatch.batchName. That
    // index prevents the same batch name from being used in another month or
    // academic year. Drop it once; `batchCode` now carries batch identity.
    try {
      const Batch = require('../models/PaymentBatch');
      const indexes = await Batch.collection.indexes();
      const legacy = indexes.find(index => index.name === 'batchName_1' && index.unique);
      if (legacy) {
        await Batch.collection.dropIndex('batchName_1');
        console.log('✅ Removed legacy unique index on PaymentBatch.batchName');
      }
    } catch (indexError) {
      // A missing collection/index is harmless (fresh database).
      if (indexError.codeName !== 'NamespaceNotFound' && indexError.code !== 26) {
        console.warn('⚠️  Could not remove legacy batchName index:', indexError.message);
      }
    }
  } catch (err) {
    console.error('❌ DB error:', err.message);
    process.exit(1);
  }
};
