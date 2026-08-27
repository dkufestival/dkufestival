const express = require('express');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/require-role');
const { validateBody } = require('../middleware/validate');
const songController = require('../controllers/song.controller');

const router = express.Router();

router.post('/', auth, requireRole('PARTICIPANT'), validateBody({
  songTitle: { required: true, type: 'string', maxLength: 200 },
  artist: { type: 'string', maxLength: 200 },
}), songController.create);
router.get('/me', auth, requireRole('PARTICIPANT'), songController.listMine);
router.delete('/:requestId', auth, requireRole('PARTICIPANT'), songController.cancel);
module.exports = router;
