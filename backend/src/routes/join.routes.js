// 합석 요청 REST 라우트
const express = require('express');
const joinController = require('../controllers/join.controller');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/', auth, joinController.createJoinRequest);
router.get('/', auth, joinController.getJoinRequests);
router.patch('/:requestId/accept', auth, joinController.acceptJoinRequest);
router.patch('/:requestId/reject', auth, joinController.rejectJoinRequest);
router.delete('/:requestId', auth, joinController.cancelJoinRequest);

module.exports = router;
