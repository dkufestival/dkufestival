// 관리자 REST 라우트
const express = require('express');
const adminController = require('../controllers/admin.controller');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/require-role');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

router.post('/login', validateBody({
  id: { required: true, type: 'string', maxLength: 100 },
  password: { required: true, type: 'string', maxLength: 200 },
}), adminController.login);
router.get('/tables', auth, requireRole('ADMIN'), adminController.getTables);
router.post('/tables/:tableId/checkout', auth, requireRole('ADMIN'), adminController.checkoutTable);

module.exports = router;
