// 관리자 REST 라우트
const express = require('express');
const adminController = require('../controllers/admin.controller');
const chatController = require('../controllers/chat.controller');
const staffCallController = require('../controllers/staffCall.controller');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/require-role');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

router.post('/login', validateBody({
  id: { required: true, type: 'string', maxLength: 100 },
  password: { required: true, type: 'string', maxLength: 200 },
}), adminController.login);
router.get('/tables', auth, requireRole('ADMIN'), adminController.getTables);
router.get('/participants', auth, requireRole('ADMIN'), adminController.getParticipants);
router.post('/participants/:participantId/end-access', auth, requireRole('ADMIN'), validateBody({
  reason: { type: 'string', maxLength: 255 },
}), adminController.endParticipantAccess);
router.post('/participants/:participantId/kick', auth, requireRole('ADMIN'), validateBody({
  reason: { type: 'string', maxLength: 255 },
}), adminController.kickParticipant);
router.post('/participants/:participantId/restore', auth, requireRole('ADMIN'), adminController.restoreParticipant);
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
router.delete('/global-chat', auth, requireRole('ADMIN'), adminController.clearGlobalChat);
router.post('/data/reset', auth, requireRole('ADMIN'), adminController.resetAllData);
router.get('/chat/rooms', auth, requireRole('ADMIN'), chatController.adminListRooms);
router.post('/chat/rooms/:roomId/end', auth, requireRole('ADMIN'), chatController.adminEndRoom);
router.get('/staff-calls', auth, requireRole('ADMIN'), staffCallController.adminList);
router.post('/staff-calls/:id/resolve', auth, requireRole('ADMIN'), staffCallController.adminResolve);

module.exports = router;
