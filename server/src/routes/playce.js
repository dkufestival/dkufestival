const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { getConnection } = require('../db/mysql');
const { awardCorrectAnswersForQuestion } = require('../services/scoreService');
const teamService = require('../services/teamService');

const router = express.Router();
const recreationUploadDirectory = path.join(__dirname, '../../uploads/recreation');
fs.mkdirSync(recreationUploadDirectory, { recursive: true });

const recreationImageUpload = multer({
  storage: multer.diskStorage({
    destination: recreationUploadDirectory,
    filename: (_req, file, callback) => {
      const extensions = {
        'image/heic': '.heic',
        'image/heif': '.heif',
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
      };
      callback(null, `image-quiz-${Date.now()}-${Math.round(Math.random() * 1e9)}${extensions[file.mimetype] || '.jpg'}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!['image/heic', 'image/heif', 'image/jpeg', 'image/jpg', 'image/png'].includes(file.mimetype)) {
      callback(new Error(`지원하지 않는 이미지 형식입니다: ${file.mimetype || '알 수 없음'}`));
      return;
    }
    callback(null, true);
  },
});

const GAME_DEFINITIONS = [
  { type: 'OX', title: 'O/X 퀴즈', sortOrder: 1 },
  { type: 'RPS', title: '가위바위보', sortOrder: 2 },
  { type: 'IMAGE', title: '이미지 게임', sortOrder: 3 },
  { type: 'WORD', title: '제시어 맞추기', sortOrder: 4 },
  { type: 'ANONYMOUS', title: '익명한마디', sortOrder: 5 },
  { type: 'BALANCE', title: '밸런스 게임', sortOrder: 6 },
  { type: 'CHOSUNG', title: '초성 퀴즈', sortOrder: 7 },
  { type: 'ROULETTE', title: '룰렛', sortOrder: 8 },
  { type: 'MISSION_PHOTO', title: '미션 사진 찍기', sortOrder: 9 },
  { type: 'MUSIC', title: '음악 퀴즈', sortOrder: 10 },
];

let schemaReady = false;

async function addColumnIfMissing(pool, tableName, columnName, columnSql) {
  const [columns] = await pool.execute(`SHOW COLUMNS FROM ${tableName}`);
  if (columns.some((column) => column.Field === columnName)) return;

  try {
    await pool.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`);
  } catch (error) {
    if (error.code !== 'ER_DUP_FIELDNAME') {
      throw error;
    }
  }
}

async function ensureSchema(pool) {
  if (schemaReady) return;

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS room_schedules (
      schedule_id INT AUTO_INCREMENT PRIMARY KEY,
      room_id INT NOT NULL,
      schedule_date DATE NOT NULL,
      start_time TIME NOT NULL,
      title VARCHAR(100) NOT NULL,
      note VARCHAR(255),
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_room_schedules_room_date (room_id, schedule_date),
      CONSTRAINT fk_room_schedules_room
        FOREIGN KEY (room_id) REFERENCES rooms(room_id)
        ON DELETE CASCADE
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS recreation_games (
      game_id INT AUTO_INCREMENT PRIMARY KEY,
      room_id INT NOT NULL,
      game_type VARCHAR(30) NOT NULL,
      title VARCHAR(100) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT '미실행',
      is_enabled TINYINT(1) NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_recreation_games_room_type (room_id, game_type),
      INDEX idx_recreation_games_room (room_id),
      CONSTRAINT fk_recreation_games_room
        FOREIGN KEY (room_id) REFERENCES rooms(room_id)
        ON DELETE CASCADE
    )
  `);

  const [gameColumns] = await pool.execute('SHOW COLUMNS FROM recreation_games');
  if (!gameColumns.some((column) => column.Field === 'is_enabled')) {
    try {
      await pool.execute('ALTER TABLE recreation_games ADD COLUMN is_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER status');
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') {
        throw error;
      }
    }
  }

  await addColumnIfMissing(pool, 'room_members', 'organization', 'organization VARCHAR(100)');
  await addColumnIfMissing(pool, 'room_members', 'student_number', 'student_number VARCHAR(50)');
  await addColumnIfMissing(pool, 'room_members', 'activity_note', 'activity_note VARCHAR(255)');
  await addColumnIfMissing(pool, 'rooms', 'current_question_id', 'current_question_id INT');
  await addColumnIfMissing(pool, 'rooms', 'answer_revealed', 'answer_revealed TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing(pool, 'rooms', 'current_prompt_index', 'current_prompt_index INT NOT NULL DEFAULT 0');
  await addColumnIfMissing(pool, 'rooms', 'current_image_stage', 'current_image_stage INT NOT NULL DEFAULT 0');
  await addColumnIfMissing(pool, 'recreation_questions', 'image_focus', "image_focus VARCHAR(20) NOT NULL DEFAULT 'center'");

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS recreation_questions (
      question_id INT AUTO_INCREMENT PRIMARY KEY,
      game_id INT NOT NULL,
      prompt TEXT,
      answer VARCHAR(255),
      option_1 VARCHAR(255),
      option_2 VARCHAR(255),
      option_3 VARCHAR(255),
      image_url TEXT,
      image_focus VARCHAR(20) NOT NULL DEFAULT 'center',
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_recreation_questions_game (game_id),
      CONSTRAINT fk_recreation_questions_game
        FOREIGN KEY (game_id) REFERENCES recreation_games(game_id)
        ON DELETE CASCADE
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS recreation_answers (
      answer_id INT AUTO_INCREMENT PRIMARY KEY,
      question_id INT NOT NULL,
      member_id INT,
      answer_text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_recreation_answers_question (question_id),
      CONSTRAINT fk_recreation_answers_question
        FOREIGN KEY (question_id) REFERENCES recreation_questions(question_id)
        ON DELETE CASCADE
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS room_notifications (
      notification_id INT AUTO_INCREMENT PRIMARY KEY,
      room_id INT NOT NULL,
      member_id INT,
      notification_type VARCHAR(20) NOT NULL,
      message VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_room_notifications_room_created (room_id, created_at),
      CONSTRAINT fk_room_notifications_room
        FOREIGN KEY (room_id) REFERENCES rooms(room_id)
        ON DELETE CASCADE
    )
  `);

  schemaReady = true;
}

async function withPool(handler) {
  const pool = await getConnection();
  await ensureSchema(pool);
  return handler(pool);
}

async function resolveRoomId(pool, requestedRoomId) {
  if (requestedRoomId) {
    const [rows] = await pool.execute('SELECT room_id FROM rooms WHERE room_id = ?', [requestedRoomId]);
    if (rows.length > 0) return rows[0].room_id;
  }

  const [rooms] = await pool.execute('SELECT room_id FROM rooms ORDER BY room_id DESC LIMIT 1');
  if (rooms.length === 0) {
    throw new Error('방이 없습니다. 먼저 방을 생성해주세요.');
  }

  return rooms[0].room_id;
}

function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

async function createUniqueRoomCode(pool) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = makeRoomCode();
    const [existing] = await pool.execute('SELECT room_id FROM rooms WHERE room_code = ?', [code]);
    if (existing.length === 0) return code;
  }

  throw new Error('방 코드를 생성하지 못했습니다.');
}

async function ensureGames(pool, roomId) {
  for (const game of GAME_DEFINITIONS) {
    await pool.execute(
      `INSERT INTO recreation_games (room_id, game_type, title, sort_order)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE title = VALUES(title), sort_order = VALUES(sort_order)`,
      [roomId, game.type, game.title, game.sortOrder]
    );
  }
}

async function findGame(pool, roomId, type) {
  await ensureGames(pool, roomId);
  const [rows] = await pool.execute(
    'SELECT game_id, room_id, game_type, title, status, sort_order FROM recreation_games WHERE room_id = ? AND game_type = ?',
    [roomId, type]
  );
  return rows[0] || null;
}

function toQuestion(row) {
  return {
    id: String(row.question_id),
    questionId: row.question_id,
      prompt: row.prompt || '',
      answer: row.answer || '',
      option1: row.option_1 || '',
      option2: row.option_2 || '',
      option3: row.option_3 || '',
      imageUrl: row.image_url || '',
      imageFocus: row.image_focus || 'center',
      sortOrder: row.sort_order,
  };
}

function normalizeScheduleTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] ? Number(match[3]) : 0;
  if (hour > 23 || minute > 59 || second > 59) return null;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function normalizeAnswer(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

async function emitRoomEvent(req, pool, roomId, eventName, payload = {}) {
  const io = req.app.get('io');
  if (!io) return;
  const [rooms] = await pool.execute('SELECT room_code FROM rooms WHERE room_id = ?', [roomId]);
  const roomCode = rooms[0]?.room_code;
  if (roomCode) io.to(roomCode).emit(eventName, { roomCode, ...payload });
}

async function createNotification(pool, roomId, memberId, type, message) {
  await pool.execute(
    'INSERT INTO room_notifications (room_id, member_id, notification_type, message) VALUES (?, ?, ?, ?)',
    [roomId, memberId || null, type, message]
  );
}

router.post('/recreation/upload', (req, res) => {
  recreationImageUpload.single('image')(req, res, (error) => {
    if (error) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? '이미지는 8MB 이하만 업로드할 수 있습니다.'
        : error.message || '이미지 업로드에 실패했습니다.';
      return res.status(400).json({ success: false, message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: '업로드할 이미지 파일이 필요합니다.' });
    }

    return res.json({ success: true, imageUrl: `/uploads/recreation/${req.file.filename}` });
  });
});

router.get('/rooms/default', async (req, res) => {
  try {
    await withPool(async (pool) => {
      const roomId = await resolveRoomId(pool, req.query.roomId);
      const [rows] = await pool.execute('SELECT room_id, room_code, title FROM rooms WHERE room_id = ?', [roomId]);
      return res.json({ success: true, room: rows[0] });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/rooms/current', async (req, res) => {
  try {
    await withPool(async (pool) => {
      const roomId = await resolveRoomId(pool, req.query.roomId);
      const [rows] = await pool.execute(
        `SELECT r.room_id, r.room_code, r.title, r.current_activity_type, r.current_activity_title,
                r.current_question_id, r.answer_revealed, r.current_prompt_index, r.current_image_stage,
                q.prompt AS current_prompt, q.answer AS current_answer,
                q.option_1 AS current_option_1, q.option_2 AS current_option_2, q.option_3 AS current_option_3
         FROM rooms r
         LEFT JOIN recreation_questions q ON r.current_question_id = q.question_id
         WHERE r.room_id = ?`,
        [roomId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: '방을 찾을 수 없습니다.' });
      }

      const room = rows[0];
      return res.json({
        success: true,
        room: {
          roomId: room.room_id,
          roomCode: room.room_code,
          title: room.title,
          currentActivityType: room.current_activity_type,
          currentActivityTitle: room.current_activity_title,
          currentQuestionId: room.current_question_id,
          answerRevealed: Boolean(room.answer_revealed),
          currentPromptIndex: Number(room.current_prompt_index || 0),
          currentImageStage: Number(room.current_image_stage || 0),
          currentPrompt: room.current_prompt || '',
          currentOption1: room.current_option_1 || '',
          currentOption2: room.current_option_2 || '',
          currentOption3: room.current_option_3 || '',
          currentAnswer: room.answer_revealed ? (room.current_answer || room.current_prompt || '') : '',
        },
      });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/rooms', async (req, res) => {
  const hostId = req.query.hostId;
  if (!hostId) {
    return res.status(400).json({ success: false, message: 'hostId가 필요합니다.' });
  }

  try {
    await withPool(async (pool) => {
      const [rows] = await pool.execute(
        `SELECT room_id, room_code, title, current_activity_type, current_activity_title, created_at
         FROM rooms
         WHERE host_id = ?
         ORDER BY created_at DESC, room_id DESC`,
        [hostId]
      );

      return res.json({
        success: true,
        rooms: rows.map((row) => ({
          roomId: row.room_id,
          roomCode: row.room_code,
          title: row.title,
          currentActivityType: row.current_activity_type,
          currentActivityTitle: row.current_activity_title,
          createdAt: row.created_at,
        })),
      });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/rooms', async (req, res) => {
  const { hostId, title } = req.body || {};
  if (!hostId) {
    return res.status(400).json({ success: false, message: 'hostId가 필요합니다.' });
  }

  try {
    await withPool(async (pool) => {
      const roomCode = await createUniqueRoomCode(pool);
      const roomTitle = String(title || '새 방').trim() || '새 방';
      const [result] = await pool.execute(
        'INSERT INTO rooms (host_id, room_code, title) VALUES (?, ?, ?)',
        [hostId, roomCode, roomTitle]
      );

      return res.json({
        success: true,
        room: {
          roomId: result.insertId,
          roomCode,
          title: roomTitle,
        },
      });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/rooms/join', async (req, res) => {
  const { roomCode, nickname, organization, studentNumber } = req.body;
  if (!roomCode) {
    return res.status(400).json({ success: false, message: '방 코드를 입력해주세요.' });
  }

  const displayName = String(nickname || '').trim();
  if (!displayName) {
    return res.status(400).json({ success: false, message: '이름을 입력해주세요.' });
  }

  try {
    await withPool(async (pool) => {
      const [rooms] = await pool.execute(
        'SELECT room_id, room_code, title FROM rooms WHERE room_code = ?',
        [String(roomCode).trim().toUpperCase()]
      );
      if (rooms.length === 0) {
        return res.status(404).json({ success: false, message: '방을 찾을 수 없습니다.' });
      }

      const [result] = await pool.execute(
        'INSERT INTO room_members (room_id, nickname, organization, student_number) VALUES (?, ?, ?, ?)',
        [
          rooms[0].room_id,
          displayName,
          String(organization || '').trim(),
          String(studentNumber || '').trim(),
        ]
      );

      return res.json({
        success: true,
        room: rooms[0],
        member: {
          memberId: result.insertId,
          nickname: displayName,
          organization: String(organization || '').trim(),
          studentNumber: String(studentNumber || '').trim(),
        },
      });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/attendance', async (req, res) => {
  try {
    await withPool(async (pool) => {
      const roomId = await resolveRoomId(pool, req.query.roomId);
      const [rows] = await pool.execute(
        `SELECT member_id, nickname, organization, student_number, joined_at, activity_note
         FROM room_members
         WHERE room_id = ?
         ORDER BY joined_at ASC, member_id ASC`,
        [roomId]
      );

      return res.json({
        success: true,
        roomId,
        members: rows.map((row) => ({
          id: row.member_id,
          name: row.nickname,
          school: row.organization || '',
          num: row.student_number || '',
          note: row.activity_note || '',
          joinedAt: row.joined_at,
        })),
      });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch('/members/:memberId/report', async (req, res) => {
  const note = String(req.body?.note || '').trim();

  try {
    await withPool(async (pool) => {
      const roomId = await resolveRoomId(pool, req.query.roomId || req.body?.roomId);
      const [members] = await pool.execute(
        'SELECT member_id, nickname FROM room_members WHERE member_id = ? AND room_id = ?',
        [req.params.memberId, roomId]
      );
      if (members.length === 0) {
        return res.status(404).json({ success: false, message: '참가자를 찾을 수 없습니다.' });
      }

      const [result] = await pool.execute(
        'UPDATE room_members SET activity_note = ? WHERE member_id = ? AND room_id = ?',
        [note, req.params.memberId, roomId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: '참가자를 찾을 수 없습니다.' });
      }

      const member = members[0];
      await createNotification(
        pool,
        roomId,
        member.member_id,
        note ? 'MOVE' : 'RETURN',
        note ? `${member.nickname} - ${note}` : `${member.nickname} - 복귀 완료`
      );

      return res.json({ success: true, note });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/members/:memberId', async (req, res) => {
  try {
    await withPool(async (pool) => {
      const roomId = await resolveRoomId(pool, req.query.roomId || req.body?.roomId);
      const [members] = await pool.execute(
        'SELECT member_id, nickname FROM room_members WHERE member_id = ? AND room_id = ?',
        [req.params.memberId, roomId]
      );
      if (members.length === 0) {
        return res.status(404).json({ success: false, message: '참가자를 찾을 수 없습니다.' });
      }

      const member = members[0];
      await createNotification(pool, roomId, member.member_id, 'LEAVE', `${member.nickname} - 방 나감`);
      await pool.execute('DELETE FROM room_members WHERE member_id = ? AND room_id = ?', [req.params.memberId, roomId]);

      return res.json({ success: true });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/rooms/:roomId/control', async (req, res) => {
  try {
    await withPool(async (pool) => {
      const [rows] = await pool.execute(
        `SELECT r.room_id, r.current_activity_type, r.current_activity_title,
                r.current_question_id, r.answer_revealed, r.current_prompt_index, r.current_image_stage,
                q.prompt AS current_prompt, q.answer AS current_answer
         FROM rooms r
         LEFT JOIN recreation_questions q ON r.current_question_id = q.question_id
         WHERE r.room_id = ?`,
        [req.params.roomId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: '방을 찾을 수 없습니다.' });
      }

      const room = rows[0];
      return res.json({
        success: true,
        control: {
          roomId: room.room_id,
          activityType: room.current_activity_type,
          activityTitle: room.current_activity_title,
          questionId: room.current_question_id,
          answerRevealed: Boolean(room.answer_revealed),
          currentPromptIndex: Number(room.current_prompt_index || 0),
          currentImageStage: Number(room.current_image_stage || 0),
          answer: room.answer_revealed ? (room.current_answer || room.current_prompt || '') : '',
        },
      });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    await withPool(async (pool) => {
      const roomId = await resolveRoomId(pool, req.query.roomId);
      const [rows] = await pool.execute(
        `SELECT n.notification_id, n.member_id, n.notification_type, n.message, n.created_at,
                m.nickname, m.organization, m.student_number
         FROM room_notifications n
         LEFT JOIN room_members m ON n.member_id = m.member_id
         WHERE n.room_id = ?
         ORDER BY n.created_at DESC, n.notification_id DESC
         LIMIT 50`,
        [roomId]
      );

      return res.json({
        success: true,
        notifications: rows.map((row) => ({
          id: row.notification_id,
          memberId: row.member_id,
          type: row.notification_type,
          message: row.message,
          name: row.nickname || '참가자',
          school: row.organization || '',
          num: row.student_number || '',
          createdAt: row.created_at,
        })),
      });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/schedules', async (req, res) => {
  const scheduleDate = req.query.date || new Date().toISOString().slice(0, 10);

  try {
    await withPool(async (pool) => {
      const roomId = await resolveRoomId(pool, req.query.roomId);
      const [rows] = await pool.execute(
        `SELECT schedule_id, start_time, title, note
         FROM room_schedules
         WHERE room_id = ? AND schedule_date = ?
         ORDER BY sort_order ASC, start_time ASC`,
        [roomId, scheduleDate]
      );

      return res.json({
        success: true,
        roomId,
        date: scheduleDate,
        schedules: rows.map((row) => ({
          id: row.schedule_id,
          time: String(row.start_time).slice(0, 5),
          task: row.title,
          note: row.note || '',
        })),
      });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/schedules', async (req, res) => {
  const scheduleDate = req.body?.date || req.query.date || new Date().toISOString().slice(0, 10);
  const schedules = Array.isArray(req.body?.schedules) ? req.body.schedules : [];

  try {
    await withPool(async (pool) => {
      const roomId = await resolveRoomId(pool, req.query.roomId || req.body?.roomId);
      await pool.execute('DELETE FROM room_schedules WHERE room_id = ? AND schedule_date = ?', [roomId, scheduleDate]);

      for (const [index, schedule] of schedules.entries()) {
        const time = String(schedule.time || '').trim();
        const title = String(schedule.task || schedule.title || '').trim();
        const note = String(schedule.note || '').trim();
        if (!time && !title && !note) continue;
        if (!time || !title) {
          return res.status(400).json({ success: false, message: '시간과 일정명을 모두 입력해주세요.' });
        }
        const normalizedTime = normalizeScheduleTime(time);
        if (!normalizedTime) {
          return res.status(400).json({ success: false, message: '시간은 09:00 형식으로 입력해주세요.' });
        }

        await pool.execute(
          'INSERT INTO room_schedules (room_id, schedule_date, start_time, title, note, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
          [roomId, scheduleDate, normalizedTime, title, note, index + 1]
        );
      }

      return res.json({ success: true, message: '일정이 저장되었습니다.' });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/recreation', async (req, res) => {
  try {
    await withPool(async (pool) => {
      const roomId = await resolveRoomId(pool, req.query.roomId);
      await ensureGames(pool, roomId);

      const [rows] = await pool.execute(
        'SELECT game_id, game_type, title, status FROM recreation_games WHERE room_id = ? AND is_enabled = 1 ORDER BY sort_order ASC',
        [roomId]
      );

      return res.json({
        success: true,
        roomId,
        games: rows.map((row) => ({
          id: String(row.game_id),
          type: row.game_type,
          title: row.title,
          status: row.status,
        })),
      });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/recreation/available/list', async (req, res) => {
  try {
    await withPool(async (pool) => {
      const roomId = await resolveRoomId(pool, req.query.roomId);
      await ensureGames(pool, roomId);

      const [rows] = await pool.execute(
        'SELECT game_id, game_type, title, status, is_enabled FROM recreation_games WHERE room_id = ? ORDER BY sort_order ASC',
        [roomId]
      );

      return res.json({
        success: true,
        games: rows.map((row) => ({
          id: String(row.game_id),
          type: row.game_type,
          title: row.title,
          status: row.status,
          isEnabled: Boolean(row.is_enabled),
        })),
      });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/recreation/:type/add', async (req, res) => {
  try {
    await withPool(async (pool) => {
      const roomId = await resolveRoomId(pool, req.query.roomId || req.body?.roomId);
      const game = await findGame(pool, roomId, req.params.type.toUpperCase());
      if (!game) {
        return res.status(404).json({ success: false, message: '레크레이션을 찾을 수 없습니다.' });
      }

      await pool.execute('UPDATE recreation_games SET is_enabled = 1, status = ? WHERE game_id = ?', ['미실행', game.game_id]);
      return res.json({ success: true });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/recreation/:type', async (req, res) => {
  try {
    await withPool(async (pool) => {
      const roomId = await resolveRoomId(pool, req.query.roomId);
      const game = await findGame(pool, roomId, req.params.type.toUpperCase());
      if (!game) {
        return res.status(404).json({ success: false, message: '레크레이션을 찾을 수 없습니다.' });
      }

      const [rows] = await pool.execute(
        'SELECT * FROM recreation_questions WHERE game_id = ? ORDER BY sort_order ASC, question_id ASC',
        [game.game_id]
      );

      return res.json({
        success: true,
        roomId,
        game: {
          id: game.game_id,
          type: game.game_type,
          title: game.title,
          status: game.status,
        },
        questions: rows.map(toQuestion),
      });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/recreation/:type', async (req, res) => {
  const body = req.body || {};
  const questions = Array.isArray(body.questions) ? body.questions : [];
  console.log('[Recreation API] request body:', { type: req.params.type, roomId: req.query.roomId || body.roomId, questions });

  try {
    await withPool(async (pool) => {
      const roomId = await resolveRoomId(pool, req.query.roomId || body.roomId);
      const game = await findGame(pool, roomId, req.params.type.toUpperCase());
      if (!game) {
        return res.status(404).json({ success: false, message: '레크레이션을 찾을 수 없습니다.' });
      }

      await pool.execute('DELETE FROM recreation_questions WHERE game_id = ?', [game.game_id]);

      for (const [index, question] of questions.entries()) {
        const hasContent = [
          question.prompt,
          question.answer,
          question.option1,
          question.option2,
          question.option3,
          question.imageUrl,
        ].some((value) => String(value || '').trim());
        if (!hasContent) continue;

        await pool.execute(
          `INSERT INTO recreation_questions
            (game_id, prompt, answer, option_1, option_2, option_3, image_url, image_focus, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            game.game_id,
            question.prompt || '',
            question.answer || '',
            question.option1 || '',
            question.option2 || '',
            question.option3 || '',
            question.imageUrl || '',
            question.imageFocus || 'center',
            index + 1,
          ]
        );
      }

      await pool.execute('UPDATE recreation_games SET status = ?, is_enabled = 1 WHERE game_id = ?', ['미실행', game.game_id]);
      console.log('[Recreation API] saved result:', { roomId, gameId: game.game_id, type: req.params.type, savedQuestions: questions.length });
      return res.json({ success: true, message: '저장되었습니다.' });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/recreation/:type/start', async (req, res) => {
  const body = req.body || {};

  try {
    await withPool(async (pool) => {
      const roomId = await resolveRoomId(pool, req.query.roomId || body.roomId);
      const game = await findGame(pool, roomId, req.params.type.toUpperCase());
      if (!game) {
        return res.status(404).json({ success: false, message: '레크레이션을 찾을 수 없습니다.' });
      }

      const [questions] = await pool.execute(
        'SELECT question_id FROM recreation_questions WHERE game_id = ? ORDER BY sort_order ASC, question_id ASC LIMIT 1',
        [game.game_id]
      );
      const firstQuestionId = questions[0]?.question_id || null;

      await pool.execute(
        'UPDATE rooms SET current_activity_type = ?, current_activity_title = ?, current_question_id = ?, answer_revealed = 0, current_prompt_index = 0, current_image_stage = 0 WHERE room_id = ?',
        [game.game_type, game.title, firstQuestionId, roomId]
      );
      await pool.execute('UPDATE recreation_games SET status = ? WHERE game_id = ?', ['진행중', game.game_id]);

      return res.json({ success: true });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/recreation/:type/current-question', async (req, res) => {
  const body = req.body || {};
  const questionId = body.questionId || null;
  const promptIndex = Number.isFinite(Number(body.promptIndex)) ? Math.max(0, Math.min(2, Number(body.promptIndex))) : 0;

  try {
    await withPool(async (pool) => {
      const roomId = await resolveRoomId(pool, req.query.roomId || body.roomId);
      const game = await findGame(pool, roomId, req.params.type.toUpperCase());
      if (!game) {
        return res.status(404).json({ success: false, message: '레크레이션을 찾을 수 없습니다.' });
      }

      if (questionId) {
        const [questions] = await pool.execute(
          'SELECT question_id FROM recreation_questions WHERE question_id = ? AND game_id = ?',
          [questionId, game.game_id]
        );
        if (questions.length === 0) {
          return res.status(404).json({ success: false, message: '질문을 찾을 수 없습니다.' });
        }
      }

      const [currentRoomRows] = await pool.execute(
        'SELECT current_question_id FROM rooms WHERE room_id = ?',
        [roomId]
      );
      const currentQuestionId = currentRoomRows[0]?.current_question_id || null;
      const shouldResetImageStage = String(currentQuestionId || '') !== String(questionId || '');
      await pool.execute(
        `UPDATE rooms
         SET current_activity_type = ?, current_activity_title = ?, current_question_id = ?, answer_revealed = 0,
             current_prompt_index = ?, current_image_stage = IF(?, 0, current_image_stage)
         WHERE room_id = ?`,
        [game.game_type, game.title, questionId, promptIndex, shouldResetImageStage ? 1 : 0, roomId]
      );
      await emitRoomEvent(req, pool, roomId, 'game:stateChanged', {
        gameType: game.game_type,
        questionId,
        answerRevealed: false,
        promptIndex,
      });

      return res.json({ success: true });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/recreation/:type/reveal-answer', async (req, res) => {
  const body = req.body || {};
  const questionId = body.questionId;
  const promptIndex = Number.isFinite(Number(body.promptIndex)) ? Math.max(0, Math.min(2, Number(body.promptIndex))) : null;

  if (!questionId) {
    return res.status(400).json({ success: false, message: '질문이 필요합니다.' });
  }

  try {
    await withPool(async (pool) => {
      const roomId = await resolveRoomId(pool, req.query.roomId || body.roomId);
      const game = await findGame(pool, roomId, req.params.type.toUpperCase());
      if (!game) {
        return res.status(404).json({ success: false, message: '레크레이션을 찾을 수 없습니다.' });
      }

      const [questions] = await pool.execute(
        'SELECT question_id FROM recreation_questions WHERE question_id = ? AND game_id = ?',
        [questionId, game.game_id]
      );
      if (questions.length === 0) {
        return res.status(404).json({ success: false, message: '질문을 찾을 수 없습니다.' });
      }

      await pool.execute(
        'UPDATE rooms SET current_activity_type = ?, current_activity_title = ?, current_question_id = ?, answer_revealed = 1, current_prompt_index = COALESCE(?, current_prompt_index) WHERE room_id = ?',
        [game.game_type, game.title, questionId, promptIndex, roomId]
      );
      const [roomRows] = await pool.execute(
        'SELECT current_prompt_index FROM rooms WHERE room_id = ?',
        [roomId]
      );
      await emitRoomEvent(req, pool, roomId, 'game:stateChanged', {
        gameType: game.game_type,
        questionId,
        answerRevealed: true,
        promptIndex: Number(roomRows[0]?.current_prompt_index || promptIndex || 0),
      });

      const scoreboard = await awardCorrectAnswersForQuestion(pool, roomId, questionId, 1, `auto-${game.game_type}`);
      const io = req.app.get('io');
      if (io) {
        const [rooms] = await pool.execute('SELECT room_code FROM rooms WHERE room_id = ?', [roomId]);
        const roomCode = rooms[0]?.room_code;
        if (roomCode) {
          io.to(roomCode).emit('score:changed', { roomCode, scoreboard });
        }
      }

      return res.json({ success: true });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/recreation/:type/complete', async (req, res) => {
  const body = req.body || {};

  try {
    await withPool(async (pool) => {
      const roomId = await resolveRoomId(pool, req.query.roomId || body.roomId);
      const game = await findGame(pool, roomId, req.params.type.toUpperCase());
      if (!game) {
        return res.status(404).json({ success: false, message: '레크레이션을 찾을 수 없습니다.' });
      }

      await pool.execute('UPDATE recreation_games SET status = ? WHERE game_id = ?', ['완료', game.game_id]);
      await pool.execute(
        `UPDATE rooms
         SET current_activity_type = NULL, current_activity_title = NULL, current_question_id = NULL, answer_revealed = 0
         WHERE room_id = ? AND current_activity_type = ?`,
        [roomId, game.game_type]
      );
      await pool.execute(
        'UPDATE rooms SET current_prompt_index = 0, current_image_stage = 0 WHERE room_id = ?',
        [roomId]
      );
      return res.json({ success: true });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/recreation/:type/answers', async (req, res) => {
  const body = req.body || {};
  const questionId = body.questionId;
  const answerText = String(body.answerText || '').trim();

  if (!questionId || !answerText) {
    return res.status(400).json({ success: false, message: '질문과 답안을 모두 입력해주세요.' });
  }

  try {
    await withPool(async (pool) => {
      const roomId = await resolveRoomId(pool, req.query.roomId || body.roomId);
      const game = await findGame(pool, roomId, req.params.type.toUpperCase());
      if (!game) {
        return res.status(404).json({ success: false, message: '레크레이션을 찾을 수 없습니다.' });
      }

      const [questions] = await pool.execute(
        'SELECT question_id, answer FROM recreation_questions WHERE question_id = ? AND game_id = ?',
        [questionId, game.game_id]
      );
      if (questions.length === 0) {
        return res.status(404).json({ success: false, message: '질문을 찾을 수 없습니다.' });
      }

      const memberId = body.memberId || null;
      let member = null;
      if (memberId) {
        await teamService.ensureTeamSchema(pool);
        const [members] = await pool.execute(
          `SELECT m.member_id, m.nickname, m.activity_note, t.team_name
           FROM room_members m
           LEFT JOIN room_team_members tm ON tm.member_id = m.member_id AND tm.room_id = m.room_id
           LEFT JOIN room_teams t ON t.team_id = tm.team_id
           WHERE m.member_id = ? AND m.room_id = ?
           LIMIT 1`,
          [memberId, roomId]
        );
        member = members[0] || null;
        if (!member) {
          return res.status(404).json({ success: false, message: '참가자를 찾을 수 없습니다.' });
        }
        if (String(member.activity_note || '').trim()) {
          return res.status(403).json({ success: false, message: '개인활동보고 중에는 게임에 참가할 수 없습니다.' });
        }
      }

      await pool.execute(
        'INSERT INTO recreation_answers (question_id, member_id, answer_text) VALUES (?, ?, ?)',
        [questionId, memberId, answerText]
      );

      const isCorrect = Boolean(questions[0].answer)
        && normalizeAnswer(questions[0].answer) === normalizeAnswer(answerText);
      if (isCorrect && ['IMAGE', 'WORD'].includes(game.game_type)) {
        const io = req.app.get('io');
        const [rooms] = await pool.execute('SELECT room_code FROM rooms WHERE room_id = ?', [roomId]);
        const roomCode = rooms[0]?.room_code;
        if (io && roomCode) {
          const sockets = await io.in(roomCode).fetchSockets();
          const payload = {
            roomCode,
            gameType: game.game_type,
            questionId,
            nickname: member?.nickname || '참가자',
            teamName: member?.team_name || '미배정',
          };
          sockets
            .filter((roomSocket) => roomSocket.data.role === 'host')
            .forEach((roomSocket) => roomSocket.emit('answer:correct', payload));
        }
      }

      return res.json({
        success: true,
        message: '제출되었습니다.',
        isCorrect,
      });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/recreation/:type/answers', async (req, res) => {
  try {
    await withPool(async (pool) => {
      const roomId = await resolveRoomId(pool, req.query.roomId);
      const game = await findGame(pool, roomId, req.params.type.toUpperCase());
      if (!game) {
        return res.status(404).json({ success: false, message: '레크레이션을 찾을 수 없습니다.' });
      }

      const correctOnly = String(req.query.correctOnly || '') === '1';
      await teamService.ensureTeamSchema(pool);
      const [rows] = await pool.execute(
        `SELECT a.answer_id, a.answer_text, a.created_at, q.question_id, q.prompt, q.answer,
                m.nickname, t.team_name
         FROM recreation_answers a
         JOIN recreation_questions q ON a.question_id = q.question_id
         LEFT JOIN room_members m ON a.member_id = m.member_id
         LEFT JOIN room_team_members tm ON tm.member_id = m.member_id AND tm.room_id = m.room_id
         LEFT JOIN room_teams t ON t.team_id = tm.team_id
         WHERE q.game_id = ?
         ORDER BY a.created_at DESC, a.answer_id DESC`,
        [game.game_id]
      );
      const filteredRows = correctOnly
        ? rows.filter((row) => normalizeAnswer(row.answer) === normalizeAnswer(row.answer_text))
        : rows;

      return res.json({
        success: true,
        answers: filteredRows.map((row) => ({
          id: row.answer_id,
          questionId: row.question_id,
          prompt: row.prompt || '',
          answerText: row.answer_text,
          nickname: row.nickname || '참가자',
          teamName: row.team_name || '미배정',
          isCorrect: normalizeAnswer(row.answer) === normalizeAnswer(row.answer_text),
          createdAt: row.created_at,
        })),
      });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
