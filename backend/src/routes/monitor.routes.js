const express = require('express');
const monitorController = require('../controllers/monitor.controller');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/require-role');
const { validateBody } = require('../middleware/validate');

const router = express.Router();
router.post('/auth', validateBody({ token: { required: true, type: 'string', maxLength: 1024 } }), monitorController.authenticate);
router.post('/staff-call-test', auth, requireRole('MONITOR'), monitorController.staffCallTest);
module.exports = router;
