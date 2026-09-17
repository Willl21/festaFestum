const express = require('express');
const {
  createBooking, listMyBookings, getBooking,
  listVendorBookings, vendorStats, vendorBalance,
  konfirmasiBooking, batalBooking,
} = require('../controllers/booking.controller');
const { buatUlasan } = require('../controllers/review.controller');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Rute /vendor didaftarkan SEBELUM /:bookingId, kalau tidak "vendor" akan
// ditangkap sebagai bookingId dan balasannya jadi 404.
router.get('/vendor', requireAuth, requireRole('vendor_owner'), listVendorBookings);
router.get('/vendor/stats', requireAuth, requireRole('vendor_owner'), vendorStats);
router.get('/vendor/balance', requireAuth, requireRole('vendor_owner'), vendorBalance);

router.get('/', requireAuth, listMyBookings);
router.post('/', requireAuth, createBooking);
router.get('/:bookingId', requireAuth, getBooking);

// Vendor menjawab pesanan yang masuk; customer membatalkan punyanya sendiri.
// Dua aktor berbeda, jadi penjaganya juga berbeda.
router.patch('/:bookingId/konfirmasi', requireAuth, requireRole('vendor_owner'), konfirmasiBooking);
router.post('/:bookingId/batal', requireAuth, batalBooking);

// Ulasan menempel pada pesanan, bukan pada vendor: satu pesanan satu ulasan,
// dan itulah yang membuktikan pengulas benar-benar pernah memakai jasanya.
router.post('/:bookingId/ulasan', requireAuth, buatUlasan);

module.exports = router;
