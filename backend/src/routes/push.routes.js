const express = require('express');
const pushController = require('../controllers/push.controller');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/require-role');

const router = express.Router();

router.get('/public-key', pushController.getPublicKey);
router.post('/subscriptions', auth, requireRole('PARTICIPANT'), pushController.createSubscription);
router.delete('/subscriptions', auth, requireRole('PARTICIPANT'), pushController.deleteSubscription);

module.exports = router;
