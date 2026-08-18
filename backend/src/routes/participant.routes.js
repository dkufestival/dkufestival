const express = require('express');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/require-role');
const { validateBody } = require('../middleware/validate');
const participantController = require('../controllers/participant.controller');

const router = express.Router();

router.use(auth, requireRole('PARTICIPANT'));
router.get('/me', participantController.getMe);
router.patch('/me', validateBody({
  nickname: { required: true, type: 'string', maxLength: 100 },
}), participantController.updateMe);
router.get('/', participantController.list);

module.exports = router;
