// 테이블 REST 라우트
const express = require('express');
const tableController = require('../controllers/table.controller');
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
  nickname: { type: 'string', maxLength: 100 },
  memberCount: { type: 'number', min: 1 },
  genderType: { enum: ['MALE', 'FEMALE', 'MIXED'] },
}), tableController.updateMyTable);

module.exports = router;
