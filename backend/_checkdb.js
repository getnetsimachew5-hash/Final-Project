require('dotenv').config();
const mongoose = require('mongoose');
(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sipms');
  const db = mongoose.connection.db;
  const cols = await db.listCollections().toArray();
  console.log('DB:', db.databaseName, '| collections:', cols.map(c=>c.name).join(', '));
  const users = db.collection('users');
  console.log('user count =', await users.countDocuments());
  const list = await users.find({}, { projection: { username:1, role:1, accountStatus:1, verifiedIdentity:1, passwordHash:1 } }).toArray();
  for (const u of list) console.log(u.username, '|', u.role, '|', u.accountStatus, '| verified=', u.verifiedIdentity, '| hash=', String(u.passwordHash).slice(0,7));
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
