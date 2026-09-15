const express = require('express');
const {
  createVendor, listVendors, getMyVendor, getVendorDetail, updateVendor,
  upsertMyDocument, listMyDocuments, setMyPhoto, getVendorPhoto,
} = require('../controllers/vendor.controller');
const { createService, listServices } = require('../controllers/service.controller');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Public
router.get('/', listVendors);

// PENTING: '/me' harus di atas '/:vendorId', kalau tidak Express akan
// membaca "me" sebagai vendorId dan query UUID-nya gagal.
router.get('/me', requireAuth, requireRole('vendor_owner'), getMyVendor);
router.get('/me/documents', requireAuth, requireRole('vendor_owner'), listMyDocuments);
router.put('/me/documents/:docType', requireAuth, requireRole('vendor_owner'), upsertMyDocument);
router.put('/me/photos/:slot', requireAuth, requireRole('vendor_owner'), setMyPhoto);

router.get('/:vendorId', getVendorDetail);
router.get('/:vendorId/services', listServices);
// Publik: dipasang langsung sebagai <img src>, jadi tidak boleh butuh token.
router.get('/:vendorId/photo/:slot', getVendorPhoto);

// Protected
router.post('/', requireAuth, requireRole('vendor_owner'), createVendor);
router.patch('/:vendorId', requireAuth, requireRole('vendor_owner'), updateVendor);
router.post('/:vendorId/services', requireAuth, requireRole('vendor_owner'), createService);

module.exports = router;
