const express = require('express');
const {
  listVendorsForReview, vendorReviewStats, reviewVendor,
  listPayouts, escrowSummary, decidePayout, listBookings, listUsers, verifyUser,
} = require('../controllers/admin.controller');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Satu penjaga untuk semua rute di bawah: peran admin. Akun admin dibuat
// langsung di database — POST /auth/register menolak peran ini.
router.use(requireAuth, requireRole('admin'));

router.get('/vendors', listVendorsForReview);
router.get('/stats', vendorReviewStats);
router.patch('/vendors/:vendorId/verification', reviewVendor);

router.get('/payouts', listPayouts);
router.get('/escrow', escrowSummary);
router.patch('/payouts/:payoutId', decidePayout);

router.get('/bookings', listBookings);
router.get('/users', listUsers);
router.patch('/users/:userId/verification', verifyUser);

module.exports = router;
