const express = require('express');
const {
  listConversations, openConversation, getMessages, sendMessage, unreadCount,
} = require('../controllers/chat.controller');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// Seluruh obrolan butuh login; siapa boleh melihat apa ditentukan peran
// pemanggil di dalam controller (syaratAkses), bukan requireRole di sini —
// ketiga peran memakai endpoint yang sama.
router.use(requireAuth);

// Didaftarkan SEBELUM '/:conversationId', kalau tidak "belum-dibaca" ditangkap
// sebagai id percakapan — jebakan yang sama dengan /bookings/vendor.
router.get('/belum-dibaca', unreadCount);

router.get('/', listConversations);
router.post('/', openConversation);
router.get('/:conversationId', getMessages);
router.post('/:conversationId/pesan', sendMessage);

module.exports = router;
