// 채팅 REST 라우트
const express = require('express');
const chatController = require('../controllers/chat.controller');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/rooms', auth, chatController.createRoom);
router.get('/rooms', auth, chatController.getRooms);
router.get('/rooms/:roomId/messages', auth, chatController.getMessages);

module.exports = router;
