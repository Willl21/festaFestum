const express = require('express');
const { updateService, deactivateService, getServicePhoto } = require('../controllers/service.controller');
const { listAvailability } = require('../controllers/schedule.controller');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Publik: dipakai kalender pemesanan untuk mengabu-abukan tanggal.
router.get('/:serviceId/availability', listAvailability);

// Publik: dipasang langsung sebagai <img src>, yang tidak bisa mengirim token.
router.get('/:serviceId/photo', getServicePhoto);

router.patch('/:serviceId', requireAuth, requireRole('vendor_owner'), updateService);
router.delete('/:serviceId', requireAuth, requireRole('vendor_owner'), deactivateService);

module.exports = router;
