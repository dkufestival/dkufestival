const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');

const router = express.Router();
const uploadDirectory = path.join(__dirname, '../../uploads/mission-photo');

fs.mkdirSync(uploadDirectory, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase() || '.jpg';
      callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    callback(null, file.mimetype.startsWith('image/'));
  },
});

router.post('/upload', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: '사진 파일이 필요합니다.' });
  }

  return res.status(201).json({
    imageUrl: `/uploads/mission-photo/${req.file.filename}`,
  });
});

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ message: '사진은 최대 10MB까지 업로드할 수 있습니다.' });
  }
  if (error) {
    return res.status(400).json({ message: '지원되는 사진 파일을 선택해주세요.' });
  }
  return next();
});

module.exports = router;
