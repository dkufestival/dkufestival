// 관리자 REST 라우트
const express = require('express');
const adminController = require('../controllers/admin.controller');
const songController = require('../controllers/song.controller');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/require-role');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

router.post('/login', validateBody({
  id: { required: true, type: 'string', maxLength: 100 },
  password: { required: true, type: 'string', maxLength: 200 },
}), adminController.login);
router.get('/tables', auth, requireRole('ADMIN'), adminController.getTables);
router.post('/tables/:tableId/checkin', auth, requireRole('ADMIN'), validateBody({
  maleCount: { type: 'number', min: 0 },
  femaleCount: { type: 'number', min: 0 },
}), adminController.checkin);
router.post('/tables/:tableId/extend', auth, requireRole('ADMIN'), validateBody({
  minutes: { required: true, type: 'number', min: 1 },
  paymentReference: { type: 'string', maxLength: 255 },
}), adminController.extend);
router.post('/tables/:tableId/reset-time', auth, requireRole('ADMIN'), adminController.resetTime);
router.post('/tables/:tableId/checkout', auth, requireRole('ADMIN'), adminController.checkoutTable);
router.patch('/tables/:tableId/counts', auth, requireRole('ADMIN'), validateBody({
  maleCount: { required: true, type: 'number', min: 0 },
  femaleCount: { required: true, type: 'number', min: 0 },
}), adminController.counts);
router.post('/tables/:tableId/qr/regenerate', auth, requireRole('ADMIN'), adminController.regenerateQr);
router.patch('/tables/:tableId/qr/enable', auth, requireRole('ADMIN'), adminController.enableQr);
router.patch('/tables/:tableId/qr/disable', auth, requireRole('ADMIN'), adminController.disableQr);
router.get('/song-requests', auth, requireRole('ADMIN'), songController.listAdmin);
router.patch('/song-requests/:requestId/complete', auth, requireRole('ADMIN'), songController.complete);

module.exports = router;
