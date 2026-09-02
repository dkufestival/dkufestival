const express = require('express');
const entryController = require('../controllers/entry.controller');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

router.get('/context', entryController.getContext);
router.post('/', validateBody({
  qrToken: { required: true, type: 'string', maxLength: 255 },
  clientId: { required: true, type: 'string', maxLength: 255 },
  nickname: { required: true, type: 'string', maxLength: 100 },
  gender: { required: true, type: 'string', maxLength: 10 },
}), entryController.enter);

module.exports = router;
