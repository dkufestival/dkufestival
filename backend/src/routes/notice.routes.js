const express = require('express');
const noticeController = require('../controllers/notice.controller');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/require-role');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

router.get('/', auth, noticeController.getNotices);
router.post('/', auth, requireRole('ADMIN'), validateBody({
  title: { required: true, type: 'string', maxLength: 150 },
  content: { required: true, type: 'string', maxLength: 5000 },
  category: { enum: ['GENERAL', 'GAME', 'EVENT', 'OPERATION'] },
}), noticeController.createNotice);

module.exports = router;
