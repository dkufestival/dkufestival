// 합석 요청 REST 라우트
const express = require('express');
const joinController = require('../controllers/join.controller');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/require-role');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

router.use(auth, requireRole('PARTICIPANT'));
router.post('/', validateBody({
  targetSessionId: { required: true, type: 'number', min: 1 },
  message: { type: 'string', maxLength: 500 },
}), joinController.createJoinRequest);
router.get('/', joinController.getJoinRequests);
router.patch('/:requestId/accept', joinController.acceptJoinRequest);
router.patch('/:requestId/reject', joinController.rejectJoinRequest);
router.delete('/:requestId', joinController.cancelJoinRequest);

module.exports = router;
