/* eslint-disable no-console */
/*
 * Demo data loader — makes EVERY actor's dashboard show something.
 *
 * Run:  node seed-demo.js
 *
 * It creates one verified demo student (return form + completion letter) and
 * ONE payment batch parked at each stage of the approval pipeline:
 *
 *   DEMO-Draft            → CS Department   (forward to College)
 *   DEMO-PendingCollege   → College         (approve → Academic VP)
 *   DEMO-PendingAcademic  → Academic VP     (endorse → Admin VP)
 *   DEMO-PendingAdminVP   → Admin VP        (authorize → Finance)
 *   DEMO-PendingFinance   → Finance         (pay via TeleBirr)
 *   DEMO-Paid             → everyone's History pages
 *
 * Re-running is safe: the DEMO-* batches are deleted and recreated.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User     = require('./src/models/User');
const Return   = require('./src/models/InternshipReturn');
const Letter   = require('./src/models/CompletionLetter');
const Batch    = require('./src/models/PaymentBatch');
const Request  = require('./src/models/PaymentRequest');
const TeleBirrTransaction = require('./src/models/TeleBirrTransaction');
const Settings = require('./src/models/PaymentSettings');
const { nextBatchCode } = require('./src/utils/batchIdentity');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sipms';

// Target stage → [who handled the previous step, resulting stage]
const STAGES = [
  { name: 'DEMO-Draft',             status: 'draft',               trail: [] },
  { name: 'DEMO-PendingCollege',    status: 'pending_college',     trail: ['cs_dept'] },
  { name: 'DEMO-PendingAcademic',   status: 'pending_academic_vp', trail: ['cs_dept', 'college'] },
  { name: 'DEMO-PendingAdminVP',    status: 'pending_admin_vp',    trail: ['cs_dept', 'college', 'academic_vp'] },
  { name: 'DEMO-PendingFinance',    status: 'pending_finance',     trail: ['cs_dept', 'college', 'academic_vp', 'admin_vp'] },
  { name: 'DEMO-Paid',              status: 'paid',                trail: ['cs_dept', 'college', 'academic_vp', 'admin_vp', 'finance'] },
];

const STEP_COMMENT = {
  cs_dept:     'Documents checked — forwarding to the College Office',
  college:     'College review passed — endorsing to the Academic VP',
  academic_vp: 'Academic eligibility confirmed — sending to the Admin VP',
  admin_vp:    'Budget authorized — sending directly to Finance',
  finance:     'TeleBirr payment completed',
};

(async () => {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // ---- a daily rate so amounts compute ----
  if (!(await Settings.findOne())) await Settings.create({ dailyRate: 100 });

  // ---- CS Department officer (batch creator of record) ----
  const csdept = await User.findOne({ username: 'csdept' });
  if (!csdept) throw new Error('Seed the staff accounts first: node seed.js');
  const actorOf = async (role) => (await User.findOne({ role })) || csdept;

  // ---- one verified demo student PER pipeline stage ---------------------
  // Each batch must own a different student: SIPMS enforces "one student, one
  // payment", so the same student cannot be in Draft, Pending… and Paid at the
  // same time. Separate students also demonstrate the CS Department's
  // paid-vs-pending separation on the Create Batch page.
  const DEMO_STUDENTS = {
    draft: {
      username: 'demodraft', fullName: 'Demo Draft Student',
      institutionalId: 'WCU-DEMO-101', phone: '+251911000101',
      email: 'demodraft@wcu.edu.et',
    },
    pending_college: {
      username: 'democollege', fullName: 'Demo College Student',
      institutionalId: 'WCU-DEMO-102', phone: '+251911000102',
      email: 'democollege@wcu.edu.et',
    },
    pending_academic_vp: {
      username: 'demoacademic', fullName: 'Demo Academic VP Student',
      institutionalId: 'WCU-DEMO-103', phone: '+251911000103',
      email: 'demoacademic@wcu.edu.et',
    },
    pending_admin_vp: {
      username: 'demoadminvp', fullName: 'Demo Admin VP Student',
      institutionalId: 'WCU-DEMO-104', phone: '+251911000104',
      email: 'demoadminvp@wcu.edu.et',
    },
    pending_finance: {
      username: 'demofinance', fullName: 'Demo Finance Student',
      institutionalId: 'WCU-DEMO-105', phone: '+251911000105',
      email: 'demofinance@wcu.edu.et',
    },
    paid: {
      username: 'demostudent', fullName: 'Demo Internship Student',
      institutionalId: 'WCU-DEMO-001', phone: '+251911000001',
      email: 'demostudent@wcu.edu.et',
    },
  };

  async function ensureDemoStudent(spec) {
    let student = await User.findOne({
      $or: [
        { username: spec.username },
        { institutionalId: spec.institutionalId },
        { phone: spec.phone },
      ],
    });
    if (!student) {
      student = await User.create({
        ...spec,
        passwordHash: 'Sipms@2026',
        role: 'student',
        accountStatus: 'active',
        verifiedIdentity: true,
        program: 'Computer Science',
        year: 3,
      });
      console.log(`✓ created demo student ${spec.username} / Sipms@2026`);
    } else {
      // Keep legacy demo students usable and complete.
      let changed = false;
      if (student.accountStatus !== 'active') { student.accountStatus = 'active'; changed = true; }
      if (!student.verifiedIdentity) { student.verifiedIdentity = true; changed = true; }
      if (!student.program) { student.program = 'Computer Science'; changed = true; }
      if (!student.year) { student.year = 3; changed = true; }
      if (changed) await student.save();
    }
    return student;
  }

  async function ensureReturnAndLetter(student) {
    let ret = await Return.findOne({ student: student._id });
    if (!ret) {
      ret = await Return.create({
        student: student._id,
        orgName: 'Wachemo ICT Solutions',
        orgAddress: 'Hosaena, Ethiopia',
        supervisorName: 'Demo Supervisor',
        supervisorPhone: '+251911000007',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-30'),
        status: 'submitted',
        verified: true,
        verifiedAt: new Date(),
        verifiedBy: csdept._id,
      });
      console.log(`✓ created verified return form for ${student.username}`);
    } else if (!ret.verified) {
      ret.verified = true;
      ret.verifiedAt = new Date();
      ret.verifiedBy = csdept._id;
      await ret.save();
    }

    await Letter.findOneAndUpdate(
      { return: ret._id },
      {
        return: ret._id,
        student: student._id,
        filePath: 'uploads/letters/demo-completion-letter.pdf',
        fileType: 'application/pdf',
        fileSize: 12345,
        isVerified: true,
      },
      { upsert: true, new: true }
    );

    return ret;
  }

  const demo = {};
  for (const stage of STAGES) {
    const student = await ensureDemoStudent(DEMO_STUDENTS[stage.status]);
    const ret = await ensureReturnAndLetter(student);
    demo[stage.status] = { student, ret };
  }

  // One extra verified student who is NOT in any batch, so the CS Department
  // can demonstrate "Create Batch": paid and pending students are excluded,
  // this yellow-highlighted student is the only one available for selection.
  const availableStudent = await ensureDemoStudent({
    username: 'demoavailable', fullName: 'Demo Available Student',
    institutionalId: 'WCU-DEMO-106', phone: '+251911000106',
    email: 'demoavailable@wcu.edu.et',
  });
  const availableReturn = await ensureReturnAndLetter(availableStudent);

  console.log('✓ completion letters attached');

  // ---- (re)create the demo batches ----
  const old = await Batch.find({ batchName: /^DEMO-/ }).select('_id');
  if (old.length) {
    const ids = old.map(b => b._id);
    const oldRequests = await Request.find({ batch: { $in: ids } }).select('_id');
    // Remove dependent TeleBirr transactions too; otherwise a re-seed leaves
    // confirmed transactions pointing at deleted requests.
    await TeleBirrTransaction.deleteMany({ request: { $in: oldRequests.map(r => r._id) } });
    await Request.deleteMany({ batch: { $in: ids } });
    await Batch.deleteMany({ _id: { $in: ids } });
    console.log(`• removed ${old.length} previous DEMO batch(es)`);
  }

  const DAYS = 30, RATE = 100, AMOUNT = RATE * DAYS;

  for (const stage of STAGES) {
    const { student, ret } = demo[stage.status];
    const history = [];
    for (const role of stage.trail) {
      const actor = await actorOf(role);
      history.push({
        actor: actor._id,
        action: 'approved',
        comment: STEP_COMMENT[role],
        at: new Date(),
      });
    }

    const batchMonth = 'January';
    const batchCode = await nextBatchCode(Batch, {
      batchName: stage.name,
      semester: 'First',
      academicYear: '2025/26',
      batchMonth,
    });

    const batch = await Batch.create({
      batchName: stage.name,
      batchCode,
      batchMonth,
      semester: 'First',
      academicYear: '2025/26',
      createdBy: csdept._id,
      students: [student._id],
      status: stage.status,
      history,
    });

    const request = await Request.create({
      batch: batch._id,
      student: student._id,
      return: ret._id,
      dailyRate: RATE,
      durationDays: DAYS,
      amount: AMOUNT,
      studentPhone: student.phone,
      status: stage.status === 'draft' ? 'pending_department' : stage.status,
    });

    // The History/Reports pages must see a real confirmed TeleBirr transaction
    // for a paid demo request, not just a request with status "paid".
    if (stage.status === 'paid') {
      const financeActor = await actorOf('finance');
      await TeleBirrTransaction.create({
        request: request._id,
        student: student._id,
        amount: AMOUNT,
        dailyRate: RATE,
        durationDays: DAYS,
        phone: student.phone,
        reference: `TB-DEMO-PAID-${batchCode}`,
        status: 'confirmed',
        processedBy: financeActor._id,
        confirmedAt: new Date(),
      });
    }

    console.log(`✓ ${stage.name} → ${stage.status}`);
  }

  // keep each demo student's return status in sync with its own demo batch
  for (const stage of STAGES) {
    const { ret } = demo[stage.status];
    ret.status = stage.status === 'draft' ? 'submitted' : stage.status;
    ret.rejectionReason = undefined;
    await ret.save();
  }

  // The unbatched demo student stays verified and ready for the CS Department
  // to select on the Create Batch page.
  availableReturn.status = 'submitted';
  availableReturn.rejectionReason = undefined;
  await availableReturn.save();

  await mongoose.disconnect();
  console.log('\nDone. Log in as any staff account (password Sipms@2026) and every');
  console.log('approval dashboard will have a matching DEMO-* batch to act on:');
  console.log('  csdept     → DEMO-Draft (+ demoavailable is ready to batch)');
  console.log('  college    → DEMO-PendingCollege');
  console.log('  academicvp → DEMO-PendingAcademic');
  console.log('  adminvp    → DEMO-PendingAdminVP (forward → Finance)');
  console.log('  finance    → DEMO-PendingFinance (pay via TeleBirr)');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
