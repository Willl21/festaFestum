const express = require('express');
const { updateService, deactivateService } = require('../controllers/service.controller');
const { listAvailability } = require('../controllers/schedule.controller');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Publik: dipakai kalender pemesanan untuk mengabu-abukan tanggal.
router.get('/:serviceId/availability', listAvailability);

router.patch('/:serviceId', requireAuth, requireRole('vendor_owner'), updateService);
router.delete('/:serviceId', requireAuth, requireRole('vendor_owner'), deactivateService);

module.exports = router;
