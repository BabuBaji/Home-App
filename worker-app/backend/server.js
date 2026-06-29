// HomeHelp Pro — backend REST API
// Express + JSON-file persistence. Mirrors the app's data models and job lifecycle.
const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json());

// Permissive CORS (prototype / LAN use).
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const PORT = process.env.PORT || 8080;

// ---- helpers ----
function bootstrap() {
  const s = db.get();
  return {
    worker: s.worker,
    wallet: s.wallet,
    jobStatus: s.jobStatus,
    activeJob: s.activeJob,
    bookings: s.bookings,
    earnings: s.earnings,
    walletTxns: s.walletTxns,
    documents: s.documents || [],
  };
}

// ---- health ----
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'homehelp-backend', time: new Date().toISOString() }));

// ---- auth (demo OTP: any 10-digit phone, any 4-digit OTP) ----
app.post('/api/auth/request-otp', (req, res) => {
  const phone = (req.body && req.body.phone) || '';
  res.json({ ok: true, devOtp: '1234', message: `OTP sent to ${phone}` });
});

app.post('/api/auth/verify', (req, res) => {
  const { phone, otp } = req.body || {};
  if (!otp || String(otp).length < 4) return res.status(400).json({ ok: false, error: 'Invalid OTP' });
  res.json({ ok: true, token: 'demo-token-' + (phone || 'worker'), ...bootstrap() });
});

// ---- full state re-hydration ----
app.get('/api/bootstrap', (req, res) => res.json(bootstrap()));

// ---- worker profile sub-resources ----
app.get('/api/worker', (req, res) => res.json(db.get().worker));

app.put('/api/worker/profile', (req, res) => {
  const w = db.get().worker;
  ['name', 'phone', 'email', 'city'].forEach(k => { if (req.body[k] != null) w[k] = req.body[k]; });
  db.save();
  res.json(w);
});

app.put('/api/worker/bank', (req, res) => {
  const w = db.get().worker;
  ['bankHolder', 'bankName', 'bankAccount', 'bankIfsc'].forEach(k => { if (req.body[k] != null) w[k] = req.body[k]; });
  db.save();
  res.json(w);
});

app.put('/api/worker/availability', (req, res) => {
  const w = db.get().worker;
  if (req.body.availableDays) w.availableDays = req.body.availableDays;
  if (req.body.shiftStart != null) w.shiftStart = req.body.shiftStart;
  if (req.body.shiftEnd != null) w.shiftEnd = req.body.shiftEnd;
  db.save();
  res.json(w);
});

app.put('/api/worker/preferences', (req, res) => {
  const w = db.get().worker;
  if (req.body.jobPreferences) w.jobPreferences = req.body.jobPreferences;
  db.save();
  res.json(w);
});

app.put('/api/worker/notifications', (req, res) => {
  const w = db.get().worker;
  ['notifNewJobs', 'notifPayments', 'notifPromotions', 'notifRatings'].forEach(k => {
    if (req.body[k] != null) w[k] = req.body[k];
  });
  db.save();
  res.json(w);
});

// ---- documents ----
app.get('/api/worker/documents', (req, res) => {
  const s = db.get();
  if (!s.documents) s.documents = [];
  res.json(s.documents);
});

// Records a document upload. We store the file name + flip status to "Under Review"
// (the actual file bytes are kept on-device for this prototype).
app.post('/api/worker/documents/upload', (req, res) => {
  const s = db.get();
  if (!s.documents) s.documents = [];
  const { name, fileName } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: 'Document name required' });
  let doc = s.documents.find(d => d.name === name);
  if (!doc) {
    doc = { name, status: 'Under Review', fileName: fileName || '' };
    s.documents.push(doc);
  } else {
    doc.status = 'Under Review';
    doc.fileName = fileName || doc.fileName || '';
  }
  db.save();
  res.json({ ok: true, documents: s.documents });
});

// ---- job lifecycle ----
app.post('/api/jobs/request', (req, res) => {
  const s = db.get();
  const job = s.jobPool[s.jobIndex % s.jobPool.length];
  s.jobIndex++;
  s.activeJob = job;
  s.jobStatus = 'REQUESTED';
  db.save();
  res.json({ job, jobStatus: s.jobStatus });
});

function setStatus(res, status, requireActive = true) {
  const s = db.get();
  if (requireActive && !s.activeJob) return res.status(409).json({ ok: false, error: 'No active job' });
  s.jobStatus = status;
  db.save();
  res.json({ ok: true, jobStatus: s.jobStatus, activeJob: s.activeJob });
}

app.post('/api/jobs/accept', (req, res) => setStatus(res, 'ACCEPTED'));
app.post('/api/jobs/on-the-way', (req, res) => setStatus(res, 'ON_THE_WAY'));
app.post('/api/jobs/arrived', (req, res) => setStatus(res, 'ARRIVED'));
app.post('/api/jobs/end', (req, res) => setStatus(res, 'COMPLETED'));

app.post('/api/jobs/reject', (req, res) => {
  const s = db.get();
  s.activeJob = null;
  s.jobStatus = 'NONE';
  db.save();
  res.json({ ok: true, jobStatus: s.jobStatus });
});

app.post('/api/jobs/verify-otp', (req, res) => {
  const s = db.get();
  const job = s.activeJob;
  if (!job) return res.status(409).json({ ok: false, error: 'No active job' });
  if (String(req.body.otp) === String(job.otp)) {
    s.jobStatus = 'IN_PROGRESS';
    db.save();
    return res.json({ ok: true, jobStatus: s.jobStatus });
  }
  res.json({ ok: false, error: 'Incorrect OTP' });
});

// Finish & settle -> credit earnings + wallet, append history.
app.post('/api/jobs/settle', (req, res) => {
  const s = db.get();
  const job = s.activeJob;
  if (!job) return res.status(409).json({ ok: false, error: 'No active job' });
  s.wallet.todayEarnings += job.earnings;
  s.wallet.todayJobs += 1;
  s.wallet.balance += job.earnings;
  s.wallet.totalEarned += job.earnings;
  s.bookings.unshift({ service: job.services.join(', '), customerName: job.customerName, address: job.area,
    timeInfo: `${job.dateTime} • ${job.durationHours} hours`, amount: job.earnings, status: 'Completed' });
  s.earnings.unshift({ date: `Today • ${job.id}`, amount: job.earnings, paid: true });
  s.walletTxns.unshift({ title: 'Job Payment', subtitle: `${job.id} • ${job.customerName}`, amount: job.earnings, status: 'Success', isCredit: true });
  s.activeJob = null;
  s.jobStatus = 'NONE';
  db.save();
  res.json({ ok: true, wallet: s.wallet, bookings: s.bookings, earnings: s.earnings, walletTxns: s.walletTxns });
});

app.post('/api/jobs/cancel', (req, res) => {
  const s = db.get();
  const job = s.activeJob;
  const reason = (req.body && req.body.reason) || 'Cancelled';
  if (job) {
    s.bookings.unshift({ service: job.services.join(', '), customerName: job.customerName, address: job.area,
      timeInfo: `${job.dateTime} • ${reason}`, amount: job.earnings, status: 'Cancelled' });
  }
  s.activeJob = null;
  s.jobStatus = 'NONE';
  db.save();
  res.json({ ok: true, bookings: s.bookings });
});

// ---- collections ----
app.get('/api/bookings', (req, res) => res.json(db.get().bookings));
app.get('/api/earnings', (req, res) => res.json(db.get().earnings));
app.get('/api/wallet', (req, res) => res.json({ wallet: db.get().wallet, walletTxns: db.get().walletTxns }));

// ---- wallet operations ----
app.post('/api/wallet/withdraw', (req, res) => {
  const s = db.get();
  const amount = parseInt(req.body.amount, 10);
  if (!amount || amount <= 0) return res.json({ ok: false, error: 'Enter a valid amount' });
  if (amount > s.wallet.balance) return res.json({ ok: false, error: 'Amount exceeds available balance' });
  s.wallet.balance -= amount;
  s.wallet.withdrawnTotal += amount;
  s.walletTxns.unshift({ title: 'Withdraw to Bank', subtitle: 'A/c No. xxxx1234', amount, status: 'Success', isCredit: false });
  db.save();
  res.json({ ok: true, wallet: s.wallet, walletTxns: s.walletTxns });
});

app.post('/api/wallet/add', (req, res) => {
  const s = db.get();
  const amount = parseInt(req.body.amount, 10);
  if (!amount || amount <= 0) return res.json({ ok: false, error: 'Enter a valid amount' });
  s.wallet.balance += amount;
  s.walletTxns.unshift({ title: 'Added to Wallet', subtitle: 'UPI • Instant', amount, status: 'Success', isCredit: true });
  db.save();
  res.json({ ok: true, wallet: s.wallet, walletTxns: s.walletTxns });
});

// ---- admin: reset demo data ----
app.post('/api/admin/reset', (req, res) => { db.reset(); res.json({ ok: true, ...bootstrap() }); });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`HomeHelp backend listening on http://0.0.0.0:${PORT}`);
});
