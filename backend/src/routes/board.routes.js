const express = require('express');
const boardController = require('../controllers/board.controller');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/require-role');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

router.get('/', auth, requireRole('PARTICIPANT', 'ADMIN'), boardController.list);
router.get('/profile', auth, requireRole('PARTICIPANT'), boardController.getProfile);
router.put('/profile', auth, requireRole('PARTICIPANT'), validateBody({
  gender: { required: true, enum: ['MALE', 'FEMALE'] },
  instagramId: { required: true, type: 'string', maxLength: 50 },
}), boardController.saveProfile);
router.get('/profile-views', auth, requireRole('PARTICIPANT'), boardController.profileViews);
router.post('/', auth, requireRole('PARTICIPANT'), validateBody({
  title: { required: true, type: 'string', maxLength: 150 },
  content: { required: true, type: 'string', maxLength: 3000 },
}), boardController.create);
router.get('/:id', auth, requireRole('PARTICIPANT', 'ADMIN'), boardController.get);
router.post('/:id/reveal', auth, requireRole('PARTICIPANT'), boardController.revealProfile);
router.delete('/:id', auth, requireRole('PARTICIPANT', 'ADMIN'), boardController.remove);

module.exports = router;
