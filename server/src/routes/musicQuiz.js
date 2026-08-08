const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { getConnection } = require('../db/mysql');

const router = express.Router();
const uploadDirectory = path.join(__dirname, '../../uploads/music');

// Ensure upload directory exists
fs.mkdir(uploadDirectory, { recursive: true }).catch((error) => {
  if (error.code !== 'EEXIST') console.error('Failed to create music upload directory:', error);
});

// Allowed audio MIME types and extensions
const ALLOWED_AUDIO_MIMETYPES = [
  'audio/mpeg', 'audio/mp3',          // .mp3
  'audio/mp4', 'audio/x-m4a',         // .m4a
  'audio/wav', 'audio/x-wav',         // .wav
  'audio/aac', 'audio/x-aac',         // .aac
  'audio/ogg', 'audio/x-ogg',         // .ogg
  'audio/flac', 'audio/x-flac',       // .flac
];

const ALLOWED_EXTENSIONS = /\.(mp3|m4a|wav|aac|ogg|flac)$/i;
const GENERIC_MIMETYPES = new Set(['', 'application/octet-stream']);

const storage = multer.diskStorage({
  destination: uploadDirectory,
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const fileName = file.originalname || '';
    const hasValidExtension = ALLOWED_EXTENSIONS.test(fileName);
    const mimeType = String(file.mimetype || '').toLowerCase();
    const hasValidMimeType = (
      GENERIC_MIMETYPES.has(mimeType)
      || ALLOWED_AUDIO_MIMETYPES.includes(mimeType)
      || mimeType.startsWith('audio/')
    );

    if (!hasValidExtension) {
      callback(new Error(`허용되지 않는 파일 확장자입니다: ${path.extname(fileName)}`));
      return;
    }

    if (!hasValidMimeType) {
      callback(new Error(`허용되지 않는 파일 형식입니다: ${file.mimetype}`));
      return;
    }

    callback(null, true);
  },
});

async function ensureTable() {
  const pool = await getConnection();
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS music_quiz_questions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      title VARCHAR(255) NOT NULL,
      artist VARCHAR(255) NOT NULL,
      audio_url VARCHAR(1024) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    )
  `);
  return pool;
}

function toQuestion(row) {
  return {
    id: String(row.id),
    title: row.title,
    artist: row.artist,
    audioUrl: row.audio_url,
    fileName: row.file_name,
  };
}

function getUploadedFilePath(audioUrl) {
  if (!audioUrl?.startsWith('/uploads/music/')) return null;
  return path.join(uploadDirectory, path.basename(audioUrl));
}

async function deleteUploadedFile(audioUrl) {
  const filePath = getUploadedFilePath(audioUrl);
  if (!filePath) return;
  await fs.unlink(filePath).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

router.post('/upload', upload.single('audio'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: '오디오 파일이 필요합니다.' });
  }

  return res.status(201).json({
    audioUrl: `/uploads/music/${req.file.filename}`,
    fileName: req.file.originalname,
  });
});

router.delete('/upload', async (req, res) => {
  try {
    await deleteUploadedFile(req.query.audioUrl);
    return res.status(204).send();
  } catch (error) {
    console.error('Delete uploaded music file error:', error);
    return res.status(500).json({ message: '업로드 파일을 정리하지 못했습니다.' });
  }
});

router.post('/create', upload.single('audio'), async (req, res) => {
  const { title, artist } = req.body;
  console.log('[MusicQuiz API] request body:', { title, artist, fileName: req.file?.originalname });
  if (!req.file || !title?.trim() || !artist?.trim()) {
    if (req.file) await deleteUploadedFile(`/uploads/music/${req.file.filename}`).catch(console.error);
    return res.status(400).json({ message: '곡 제목, 가수, 음악 파일이 필요합니다.' });
  }

  const audioUrl = `/uploads/music/${req.file.filename}`;
  try {
    const pool = await ensureTable();
    const [result] = await pool.execute(
      'INSERT INTO music_quiz_questions (title, artist, audio_url, file_name) VALUES (?, ?, ?, ?)',
      [title.trim(), artist.trim(), audioUrl, req.file.originalname]
    );
    const savedQuestion = toQuestion({
      id: result.insertId,
      title: title.trim(),
      artist: artist.trim(),
      audio_url: audioUrl,
      file_name: req.file.originalname,
    });
    console.log('[MusicQuiz API] saved result:', { savedQuestion });
    return res.status(201).json(savedQuestion);
  } catch (error) {
    console.error('Create uploaded music quiz question error:', error);
    await deleteUploadedFile(audioUrl).catch(console.error);
    return res.status(500).json({ message: '음악 문제를 저장하지 못했습니다.' });
  }
});

router.get('/', async (req, res) => {
  console.log('[MusicQuiz API] request GET /');
  try {
    const pool = await ensureTable();
    const [rows] = await pool.execute(
      'SELECT id, title, artist, audio_url, file_name FROM music_quiz_questions ORDER BY id'
    );
    return res.json(rows.map(toQuestion));
  } catch (error) {
    console.error('List music quiz questions error:', error);
    return res.status(500).json({ message: '음악 문제를 불러오지 못했습니다.' });
  }
});

router.post('/', async (req, res) => {
  const { title, artist, audioUrl, fileName } = req.body;
  if (!title?.trim() || !artist?.trim() || !audioUrl?.trim() || !fileName?.trim()) {
    await deleteUploadedFile(audioUrl).catch(console.error);
    return res.status(400).json({ message: '곡 정보와 음악 파일이 필요합니다.' });
  }

  try {
    const pool = await ensureTable();
    const [result] = await pool.execute(
      'INSERT INTO music_quiz_questions (title, artist, audio_url, file_name) VALUES (?, ?, ?, ?)',
      [title.trim(), artist.trim(), audioUrl.trim(), fileName.trim()]
    );
    return res.status(201).json(toQuestion({
      id: result.insertId,
      title: title.trim(),
      artist: artist.trim(),
      audio_url: audioUrl.trim(),
      file_name: fileName.trim(),
    }));
  } catch (error) {
    console.error('Create music quiz question error:', error);
    await deleteUploadedFile(audioUrl).catch(console.error);
    return res.status(500).json({ message: '음악 문제를 저장하지 못했습니다.' });
  }
});

router.put('/:id', async (req, res) => {
  const { title, artist } = req.body;
  if (!title?.trim() || !artist?.trim()) {
    return res.status(400).json({ message: '곡 제목과 가수가 필요합니다.' });
  }

  try {
    const pool = await ensureTable();
    const [result] = await pool.execute(
      'UPDATE music_quiz_questions SET title = ?, artist = ? WHERE id = ?',
      [title.trim(), artist.trim(), req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '음악 문제를 찾지 못했습니다.' });
    }
    return res.json({ id: String(req.params.id), title: title.trim(), artist: artist.trim() });
  } catch (error) {
    console.error('Update music quiz question error:', error);
    return res.status(500).json({ message: '음악 문제를 수정하지 못했습니다.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const pool = await ensureTable();
    const [rows] = await pool.execute('SELECT audio_url FROM music_quiz_questions WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: '음악 문제를 찾지 못했습니다.' });
    }
    const [result] = await pool.execute('DELETE FROM music_quiz_questions WHERE id = ?', [req.params.id]);
    if (result.affectedRows > 0) {
      await deleteUploadedFile(rows[0].audio_url).catch((error) => console.error('Delete music file error:', error));
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Delete music quiz question error:', error);
    return res.status(500).json({ message: '음악 문제를 삭제하지 못했습니다.' });
  }
});

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: '음악 파일은 최대 20MB까지 업로드할 수 있습니다.' });
    }
    if (error.code === 'LIMIT_PART_COUNT') {
      return res.status(400).json({ message: '업로드된 파일 개수가 너무 많습니다.' });
    }
    return res.status(400).json({ message: `파일 업로드 오류: ${error.message}` });
  }
  if (error) {
    console.error('Music quiz route error:', error);
    return res.status(400).json({ message: error.message || '지원되는 오디오 파일을 선택해주세요. (mp3, m4a, wav, aac, ogg, flac)' });
  }
  return next();
});

module.exports = router;
