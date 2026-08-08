// 관리자 REST 라우트
const express = require('express');
const adminController = require('../controllers/admin.controller');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/login', adminController.login);
router.get('/tables', auth, adminController.getTables);
router.post('/tables/:tableId/checkout', auth, adminController.checkoutTable);

module.exports = router;
