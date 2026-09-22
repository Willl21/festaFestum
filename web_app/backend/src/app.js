const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const vendorRoutes = require('./routes/vendor.routes');
const serviceRoutes = require('./routes/service.routes');
const scheduleRoutes = require('./routes/schedule.routes');
const bookingRoutes = require('./routes/booking.routes');
const payoutRoutes = require('./routes/payout.routes');
const adminRoutes = require('./routes/admin.routes');
const chatRoutes = require('./routes/chat.routes');
const paymentRoutes = require('./routes/payment.routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Hanya percaya X-Forwarded-For kalau memang di belakang proxy (Render/Railway).
// Kalau tidak, req.ip bisa dipalsukan dan rate limit-nya jebol.
app.set('trust proxy', process.env.TRUST_PROXY === '1');

// Origin yang boleh manggil API. Isi CORS_ORIGINS di .env waktu deploy
// (pisah koma); default-nya dev server Vite.
const ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:4173')
  .split(',')
  .map((o) => o.trim());

app.use(cors({
  // !origin = curl / Postman / webhook Midtrans, bukan browser — biarkan lewat.
  origin: (origin, cb) => cb(null, !origin || ORIGINS.includes(origin)),
}));
// Bawaan express.json() 100 KB, dan satu foto portofolio hero sudah
// menembusnya sendirian (data URL base64, lihat migrasi 008). Batas per
// gambar dijaga di controller — FOTO_MAX_CHARS ~150 KB — jadi angka di
// sini cuma plafon kasar, bukan izin mengirim apa saja.
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/vendors', vendorRoutes);
app.use('/api/v1/services', serviceRoutes);
app.use('/api/v1/schedules', scheduleRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/payouts', payoutRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/chat', chatRoutes);

app.use(errorHandler);

module.exports = app;
