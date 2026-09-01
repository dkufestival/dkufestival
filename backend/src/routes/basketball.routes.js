const express = require('express');
const basketballController = require('../controllers/basketball.controller');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/require-role');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

router.get('/leaderboard', basketballController.leaderboard);
router.get('/state', auth, requireRole('PARTICIPANT'), basketballController.state);
router.post('/scores', auth, requireRole('PARTICIPANT'), validateBody({
  score: { required: true, type: 'number', min: 1 },
}), basketballController.submitScore);

module.exports = router;
