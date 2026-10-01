const express = require('express');
const {
  register, login, googleLogin, me, updateMe, changePassword, gantiRekening,
  loginKode, lupaSandi, resetSandi, duaLangkahMulai, duaLangkahKonfirmasi, duaLangkahMatikan,
} = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/authMiddleware');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();

// Login lebih ketat dari register: login yang dibanjiri = tebak password.
router.post('/register', rateLimit(10), register);
router.post('/login', rateLimit(8), login);
router.post('/google', rateLimit(8), googleLogin);
router.get('/me', requireAuth, me);
router.patch('/me', requireAuth, updateMe);
// Sama ketatnya dengan login: endpoint ini juga menerima sandi yang bisa ditebak.
router.patch('/password', requireAuth, rateLimit(8), changePassword);
router.patch('/rekening', requireAuth, rateLimit(8), gantiRekening);

// Kode 6 digit via email (migrasi 022). Semua yang menerima kode/sandi diberi
// rate limit. lupa-sandi selalu membalas 200 jadi tidak pernah termakan rate
// limit — pembanjiran email dicegah jeda 60 detik di lib/kodeOtp.js.
router.post('/login/kode', rateLimit(8), loginKode);
router.post('/lupa-sandi', rateLimit(8), lupaSandi);
router.post('/reset-sandi', rateLimit(8), resetSandi);
router.post('/dua-langkah', requireAuth, rateLimit(8), duaLangkahMulai);
router.post('/dua-langkah/konfirmasi', requireAuth, rateLimit(8), duaLangkahKonfirmasi);
router.post('/dua-langkah/matikan', requireAuth, rateLimit(8), duaLangkahMatikan);

module.exports = router;
