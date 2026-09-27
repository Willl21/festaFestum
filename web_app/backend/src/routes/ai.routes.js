const express = require('express');
const { rekomendasi } = require('../controllers/ai.controller');

const router = express.Router();

// Publik: /festa-ai bisa dibuka tamu. Tanpa rate limit di sini karena layanan
// AI-nya sendiri terbuka (CORS *), jadi membatasi di sini tidak melindungi kuota Gemini.
router.post('/recommend', rekomendasi);

module.exports = router;
