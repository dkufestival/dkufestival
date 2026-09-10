const express = require('express');
const { getTables } = require('../controllers/public-monitor.controller');
const { monitorRateLimit } = require('../middleware/monitor-rate-limit');

const router = express.Router();
router.get('/tables', monitorRateLimit, getTables);
module.exports = router;
