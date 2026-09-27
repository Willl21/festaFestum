const express = require('express');
const { listNotifikasi, tandaiDibaca } = require('../controllers/notifikasi.controller');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// Semua peran punya lonceng sendiri; tidak ada requireRole.
router.use(requireAuth);
router.get('/', listNotifikasi);
router.post('/baca', tandaiDibaca);

module.exports = router;
