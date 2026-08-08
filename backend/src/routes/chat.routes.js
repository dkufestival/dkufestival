// 채팅 REST 라우트
const express = require('express');
const chatController = require('../controllers/chat.controller');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/require-role');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

router.post('/rooms', auth, requireRole('PARTICIPANT'), validateBody({
  targetSessionId: { required: true, type: 'number', min: 1 },
}), chatController.createRoom);
router.get('/rooms', auth, requireRole('PARTICIPANT'), chatController.getRooms);
router.get('/rooms/:roomId/messages', auth, requireRole('PARTICIPANT'), chatController.getMessages);

module.exports = router;
