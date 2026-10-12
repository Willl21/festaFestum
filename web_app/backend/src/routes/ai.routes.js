const express = require('express');
const { rekomendasi } = require('../controllers/ai.controller');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();

// Publik: /festa-ai bisa dibuka tamu. Batas ini TIDAK melindungi kuota model
// AI (layanan tim AI sendiri terbuka, CORS *, bisa ditembak langsung). Yang
// dilindungi backend kita: tiap panggilan menahan koneksi puluhan detik dan
// menjalankan query per layanan, sedang pool DB Supabase cuma 15 koneksi.
// Dihitung semua permintaan (sukses pun mahal), 20 per 15 menit per IP.
router.post('/recommend', rateLimit(20, undefined, true), rekomendasi);

module.exports = router;
