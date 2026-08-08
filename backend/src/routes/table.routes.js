// 테이블 REST 라우트
const express = require('express');
const tableController = require('../controllers/table.controller');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', tableController.getTables);
router.get('/:tableId', tableController.getTable);
router.post('/:tableId/enter', tableController.enterTable);
router.patch('/me', auth, tableController.updateMyTable);

module.exports = router;
