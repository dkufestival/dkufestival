const express = require('express');
const boardController = require('../controllers/board.controller');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/require-role');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

router.get('/', auth, requireRole('PARTICIPANT', 'ADMIN'), boardController.list);
router.post('/', auth, requireRole('PARTICIPANT'), validateBody({
  title: { required: true, type: 'string', maxLength: 150 },
  content: { required: true, type: 'string', maxLength: 3000 },
}), boardController.create);
router.delete('/:id', auth, requireRole('PARTICIPANT', 'ADMIN'), boardController.remove);

module.exports = router;
