const express = require('express');
const chatController = require('../controllers/chat.controller');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/require-role');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

router.use(auth, requireRole('PARTICIPANT'));

router.post('/requests', validateBody({
  targetSessionId: { required: true, type: 'number', min: 1 },
  message: { type: 'string', maxLength: 500 },
}), chatController.createRequest);
router.get('/requests', chatController.listRequests);
router.post('/requests/:roomId/accept', chatController.acceptRequest);
router.post('/requests/:roomId/reject', chatController.rejectRequest);
router.delete('/requests/:roomId', chatController.cancelRequest);
router.get('/active', chatController.getActive);
router.get('/rooms/:roomId/messages', chatController.getMessages);
router.post('/rooms/:roomId/end', chatController.endRoom);

module.exports = router;
