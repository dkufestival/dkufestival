const express = require('express');
const globalChatController = require('../controllers/globalChat.controller');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/require-role');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

router.get('/', auth, requireRole('PARTICIPANT', 'ADMIN'), globalChatController.list);
router.post('/', auth, requireRole('PARTICIPANT', 'ADMIN'), validateBody({
  content: { required: true, type: 'string', maxLength: 500 },
}), globalChatController.send);

module.exports = router;
