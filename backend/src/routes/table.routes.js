// 테이블 REST 라우트
const express = require('express');
const tableController = require('../controllers/table.controller');
const tableLikeController = require('../controllers/tableLike.controller');
const staffCallController = require('../controllers/staffCall.controller');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/require-role');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

router.get('/', tableController.getTables);
router.get('/:tableId', tableController.getTable);
router.post('/:tableId/enter', validateBody({
  qrToken: { required: true, type: 'string', maxLength: 255 },
  nickname: { required: true, type: 'string', maxLength: 100 },
  memberCount: { required: true, type: 'number', min: 1 },
  genderType: { required: true, enum: ['MALE', 'FEMALE', 'MIXED'] },
}), tableController.enterTable);
router.patch('/me', auth, requireRole('PARTICIPANT'), validateBody({
  maleCount: { required: true, type: 'number', min: 0 },
  femaleCount: { required: true, type: 'number', min: 0 },
}), tableController.updateMyTable);
router.patch('/me/accepting', auth, requireRole('PARTICIPANT'), validateBody({
  acceptingRequests: { required: true },
}), tableController.updateMyAccepting);
router.get('/likes/mine', auth, requireRole('PARTICIPANT'), tableLikeController.list);
router.post('/:tableId/like', auth, requireRole('PARTICIPANT'), tableLikeController.toggle);
router.get('/me/staff-call', auth, requireRole('PARTICIPANT'), staffCallController.myStatus);
router.post('/me/staff-call', auth, requireRole('PARTICIPANT'), staffCallController.create);

module.exports = router;
