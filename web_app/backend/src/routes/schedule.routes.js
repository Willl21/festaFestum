const express = require('express');
const {
  tutupTanggal, checkAvailability, listMySchedules, bukaTanggal,
} = require('../controllers/schedule.controller');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/me', requireAuth, requireRole('vendor_owner'), listMySchedules);
router.post('/check', checkAvailability);
router.post('/', requireAuth, requireRole('vendor_owner'), tutupTanggal);
router.post('/buka', requireAuth, requireRole('vendor_owner'), bukaTanggal);

module.exports = router;
