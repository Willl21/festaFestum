const express = require('express');
const { rekomendasi, chat } = require('../controllers/ai.controller');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();

// Publik: /festa-ai bisa dibuka tamu. Batas ini TIDAK melindungi kuota model
// AI (layanan tim AI sendiri terbuka, CORS *, bisa ditembak langsung). Yang
// dilindungi backend kita: tiap panggilan menahan koneksi puluhan detik dan
// menjalankan query per layanan, sedang pool DB Supabase cuma 15 koneksi.
// Dihitung semua permintaan (sukses pun mahal), 20 per 15 menit per IP.
router.post('/recommend', rateLimit(20, undefined, true), rekomendasi);
// Obrolan: satu pencarian butuh beberapa giliran. Kuota Gemini gratis
// (~15 request/menit untuk SEMUA pengguna) tetap batas yang sebenarnya.
router.post('/chat', rateLimit(40, undefined, true), chat);

module.exports = router;
