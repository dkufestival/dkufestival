require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const os = require('os');
const path = require('path');
const { Server } = require('socket.io');

const authRoutes = require('./src/routes/auth');
const playceRoutes = require('./src/routes/playce');
const roomRoutes = require('./src/routes/rooms');
const musicQuizRoutes = require('./src/routes/musicQuiz');
const missionPhotoRoutes = require('./src/routes/missionPhoto');
const { registerMusicQuizHandlers } = require('./src/musicQuizSocket');
const collaborationRoutes = require('./src/routes/collaboration');
const { registerCollaborationHandlers } = require('./src/collaborationSocket');
const { getConnection } = require('./src/db/mysql');

const VALID_GAME_TYPES = new Set(['OX', 'WORD', 'TEXT', 'IMAGE', 'RSP', 'RPS', 'ANONYMOUS', 'BALANCE', 'CHOSUNG', 'ROULETTE', 'MUSIC']);
const activeGames = new Map();
const missionPhotoGames = new Map();
const MAX_MISSION_PHOTO_IMAGE_URI_LENGTH = 8 * 1024 * 1024;
const MAX_MISSION_PHOTO_MISSION_TEXT_LENGTH = 100;
const MAX_MISSION_PHOTO_PARTICIPANT_NAME_LENGTH = 30;
const MISSION_PHOTO_DATA_URI_PATTERN = /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;
const MISSION_PHOTO_UPLOAD_PATH_PATTERN = /^\/uploads\/mission-photo\/[A-Za-z0-9._-]+$/;

function normalizeRoomCode(roomCode) {
  return String(roomCode || '').trim().toUpperCase();
}

function normalizeGameType(gameType) {
  return String(gameType || '').trim().toUpperCase();
}

function createGameId(roomCode, gameType) {
  return `${roomCode}-${gameType}-${Date.now()}`;
}

async function loadParticipantState(roomCode, memberId) {
  if (!memberId) return { isReporting: false, teamName: '미배정' };

  const pool = await getConnection();
  const [rows] = await pool.execute(
    `SELECT m.activity_note
     FROM room_members m
     JOIN rooms r ON r.room_id = m.room_id
     WHERE r.room_code = ? AND m.member_id = ?
     LIMIT 1`,
    [roomCode, memberId]
  );
  let teamName = '미배정';
  try {
    const [teams] = await pool.execute(
      `SELECT t.team_name
       FROM room_team_members tm
       JOIN room_teams t ON t.team_id = tm.team_id
       JOIN rooms r ON r.room_id = tm.room_id
       WHERE r.room_code = ? AND tm.member_id = ?
       LIMIT 1`,
      [roomCode, memberId]
    );
    teamName = teams[0]?.team_name || teamName;
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
  }
  return {
    isReporting: Boolean(String(rows[0]?.activity_note || '').trim()),
    teamName,
  };
}

async function emitToActiveParticipants(io, roomCode, eventName, payload) {
  const roomSockets = await io.in(roomCode).fetchSockets();
  roomSockets
    .filter((roomSocket) => (
      roomSocket.data.role === 'participant'
      && roomSocket.data.roomCode === roomCode
      && !roomSocket.data.isReporting
    ))
    .forEach((roomSocket) => roomSocket.emit(eventName, payload));
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 10 * 1024 * 1024,
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api', authRoutes);
app.use('/api', playceRoutes);
app.use('/api', roomRoutes);
app.use('/api', collaborationRoutes.router);
app.use('/api/music-quiz/questions', musicQuizRoutes);
app.use('/api/mission-photo', missionPhotoRoutes);
app.set('io', io);

app.get('/', (req, res) => {
  res.send('Playce server is running');
});

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  registerMusicQuizHandlers(io, socket);
  registerCollaborationHandlers(io, socket);

  socket.on('joinRoom', async (data = {}, callback) => {
    const { roomCode, role, nickname, memberId } = data || {};
    const normalizedRoomCode = normalizeRoomCode(roomCode);

    if (!normalizedRoomCode) {
      callback?.({ ok: false, message: '방 코드가 필요합니다.' });
      return;
    }

    if (!(await roomRoutes.hasRoom(normalizedRoomCode))) {
      callback?.({ ok: false, message: '존재하지 않는 방 코드입니다.' });
      return;
    }

    if (socket.data.roomCode && socket.data.roomCode !== normalizedRoomCode) {
      socket.leave(socket.data.roomCode);
    }

    socket.data.roomCode = normalizedRoomCode;
    // TODO: MVP 이후에는 클라이언트가 보낸 role 대신 인증된 host identity로 권한을 결정합니다.
    socket.data.role = role === 'host' ? 'host' : 'participant';
    socket.data.nickname = String(nickname || '').trim() || socket.data.role;
    socket.data.memberId = memberId || null;
    if (socket.data.role === 'participant') {
      const participantState = await loadParticipantState(normalizedRoomCode, memberId);
      socket.data.isReporting = participantState.isReporting;
      socket.data.teamName = participantState.teamName;
    } else {
      socket.data.isReporting = false;
      socket.data.teamName = null;
    }
    socket.join(normalizedRoomCode);
    callback?.({
      ok: true,
      roomCode: normalizedRoomCode,
      isReporting: socket.data.isReporting,
      teamName: socket.data.teamName,
    });

    const activeGame = activeGames.get(normalizedRoomCode);
    if (activeGame && socket.data.role === 'participant' && !socket.data.isReporting) {
      socket.emit('gameStarted', activeGame);
    }

    const missionPhotoGame = missionPhotoGames.get(normalizedRoomCode);
    if (missionPhotoGame && socket.data.role === 'participant' && !socket.data.isReporting) {
      socket.emit('missionPhoto:started', missionPhotoGame.payload);
    }
  });

  socket.on('activity:report', async (_data = {}, callback) => {
    if (socket.data.role !== 'participant') {
      callback?.({ ok: false, message: '참가자 연결을 확인할 수 없습니다.' });
      return;
    }
    const participantState = await loadParticipantState(socket.data.roomCode, socket.data.memberId);
    socket.data.isReporting = participantState.isReporting;
    socket.data.teamName = participantState.teamName;
    callback?.({ ok: true, isReporting: socket.data.isReporting });
  });

  socket.on('leaveRoom', (data = {}, callback) => {
    const { roomCode } = data || {};
    const normalizedRoomCode = normalizeRoomCode(roomCode || socket.data.roomCode);

    if (normalizedRoomCode) {
      socket.leave(normalizedRoomCode);
    }

    if (socket.data.roomCode === normalizedRoomCode) {
      socket.data.roomCode = null;
      socket.data.role = null;
    }

    callback?.({ ok: true });
  });

  socket.on('startGame', async (data = {}, callback) => {
    const { roomCode, gameType } = data || {};
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const normalizedGameType = normalizeGameType(gameType);

    if (!normalizedRoomCode) {
      callback?.({ ok: false, message: '방 코드가 필요합니다.' });
      return;
    }

    if (!(await roomRoutes.hasRoom(normalizedRoomCode))) {
      callback?.({ ok: false, message: '존재하지 않는 방 코드입니다.' });
      return;
    }

    if (!VALID_GAME_TYPES.has(normalizedGameType)) {
      callback?.({ ok: false, message: '지원하지 않는 게임 타입입니다.' });
      return;
    }

    if (socket.data.roomCode !== normalizedRoomCode || socket.data.role !== 'host') {
      callback?.({ ok: false, message: '진행자 방 연결을 확인할 수 없습니다.' });
      return;
    }

    const payload = {
      roomCode: normalizedRoomCode,
      gameType: normalizedGameType,
      gameId: createGameId(normalizedRoomCode, normalizedGameType),
      startedAt: new Date().toISOString(),
    };

    activeGames.set(normalizedRoomCode, payload);
    await emitToActiveParticipants(io, normalizedRoomCode, 'gameStarted', payload);
    callback?.({ ok: true, ...payload });
  });

  socket.on('endGame', async (data = {}, callback) => {
    const { roomCode } = data || {};
    const normalizedRoomCode = normalizeRoomCode(roomCode);

    if (!normalizedRoomCode) {
      callback?.({ ok: false, message: '방 코드가 필요합니다.' });
      return;
    }

    if (!(await roomRoutes.hasRoom(normalizedRoomCode))) {
      callback?.({ ok: false, message: '존재하지 않는 방 코드입니다.' });
      return;
    }

    if (socket.data.roomCode !== normalizedRoomCode || socket.data.role !== 'host') {
      callback?.({ ok: false, message: '진행자 방 연결을 확인할 수 없습니다.' });
      return;
    }

    activeGames.delete(normalizedRoomCode);
    missionPhotoGames.delete(normalizedRoomCode);

    const payload = {
      roomCode: normalizedRoomCode,
      endedAt: new Date().toISOString(),
    };

    io.to(normalizedRoomCode).emit('gameEnded', payload);
    callback?.({ ok: true, ...payload });
  });

  socket.on('missionPhoto:start', async (data = {}, callback) => {
    const { roomCode, missionText } = data || {};
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const normalizedMissionText = typeof missionText === 'string' ? missionText.trim() : '';

    if (!normalizedRoomCode || !normalizedMissionText) {
      callback?.({ ok: false, message: '방 코드와 미션 문구가 필요합니다.' });
      return;
    }

    if (normalizedMissionText.length > MAX_MISSION_PHOTO_MISSION_TEXT_LENGTH) {
      callback?.({ ok: false, message: '미션 문구는 100자 이하로 입력해주세요.' });
      return;
    }

    if (!(await roomRoutes.hasRoom(normalizedRoomCode))) {
      callback?.({ ok: false, message: '존재하지 않는 방 코드입니다.' });
      return;
    }

    if (socket.data.roomCode !== normalizedRoomCode || socket.data.role !== 'host') {
      callback?.({ ok: false, message: '진행자 방 연결을 확인할 수 없습니다.' });
      return;
    }

    socket.join(normalizedRoomCode);

    const payload = {
      roomCode: normalizedRoomCode,
      gameType: 'missionPhoto',
      missionText: normalizedMissionText,
      startedAt: new Date().toISOString(),
    };

    missionPhotoGames.set(normalizedRoomCode, {
      payload,
      submittedSocketIds: new Set(),
    });
    const roomSockets = await io.in(normalizedRoomCode).fetchSockets();
    roomSockets
      .filter((roomSocket) => (
        roomSocket.data.role === 'participant'
        && roomSocket.data.roomCode === normalizedRoomCode
        && !roomSocket.data.isReporting
      ))
      .forEach((roomSocket) => roomSocket.emit('missionPhoto:started', payload));
    callback?.({ ok: true, ...payload });
  });

  socket.on('missionPhoto:submit', async (data = {}, callback) => {
    const { roomCode, participantName, imageUri, submittedAt } = data || {};
    const normalizedRoomCode = normalizeRoomCode(roomCode || socket.data.roomCode);
    const normalizedParticipantName = typeof participantName === 'string' ? participantName.trim() : '';
    const normalizedImageUri = typeof imageUri === 'string' ? imageUri.trim() : '';

    if (!normalizedRoomCode || !normalizedParticipantName || !normalizedImageUri) {
      callback?.({ ok: false, message: '방 코드, 참가자 이름, 사진이 필요합니다.' });
      return;
    }

    if (normalizedParticipantName.length > MAX_MISSION_PHOTO_PARTICIPANT_NAME_LENGTH) {
      callback?.({ ok: false, message: '참가자 이름은 30자 이하로 입력해주세요.' });
      return;
    }

    const missionPhotoGame = missionPhotoGames.get(normalizedRoomCode);
    if (!missionPhotoGame) {
      callback?.({ ok: false, message: '진행 중인 미션 사진 게임이 없습니다.' });
      return;
    }

    if (socket.data.roomCode !== normalizedRoomCode || socket.data.role !== 'participant') {
      callback?.({ ok: false, message: '참가자 방 연결을 확인할 수 없습니다.' });
      return;
    }
    if (socket.data.isReporting) {
      callback?.({ ok: false, message: '개인활동보고 중에는 게임에 참가할 수 없습니다.' });
      return;
    }

    if (normalizedImageUri.length > MAX_MISSION_PHOTO_IMAGE_URI_LENGTH) {
      callback?.({ ok: false, message: '사진 용량이 너무 큽니다. 더 작은 사진을 선택해주세요.' });
      return;
    }

    const isUploadedImage = MISSION_PHOTO_UPLOAD_PATH_PATTERN.test(normalizedImageUri);
    const base64Payload = normalizedImageUri.split(',')[1] || '';
    const isValidDataUri = MISSION_PHOTO_DATA_URI_PATTERN.test(normalizedImageUri) && base64Payload.length % 4 === 0;
    if (!isUploadedImage && !isValidDataUri) {
      callback?.({ ok: false, message: '업로드된 사진 또는 JPEG/PNG 사진만 제출할 수 있습니다.' });
      return;
    }

    if (missionPhotoGame.submittedSocketIds.has(socket.id)) {
      callback?.({ ok: false, message: '이미 사진을 제출했습니다.' });
      return;
    }

    missionPhotoGame.submittedSocketIds.add(socket.id);
    const payload = {
      participantName: normalizedParticipantName,
      // TODO: data URI가 커지지 않도록 실제 업로드 저장소의 이미지 URL로 전환합니다.
      imageUri: normalizedImageUri,
      submittedAt: submittedAt || new Date().toISOString(),
    };

    const roomSockets = await io.in(normalizedRoomCode).fetchSockets();
    roomSockets
      .filter((roomSocket) => roomSocket.data.role === 'host' && roomSocket.data.roomCode === normalizedRoomCode)
      .forEach((roomSocket) => roomSocket.emit('missionPhoto:submitted', payload));
    callback?.({ ok: true, ...payload });
  });

  socket.on('image:stage', async (data = {}, callback) => {
    const roomCode = normalizeRoomCode(data.roomCode || socket.data.roomCode);
    const stage = Math.max(0, Math.min(4, Number(data.stage) || 0));
    if (!roomCode || socket.data.role !== 'host' || socket.data.roomCode !== roomCode) {
      callback?.({ ok: false, message: '진행자 방 연결을 확인할 수 없습니다.' });
      return;
    }
    try {
      const pool = await getConnection();
      await pool.execute('UPDATE rooms SET current_image_stage = ? WHERE room_code = ?', [stage, roomCode]);
    } catch (error) {
      console.error('Failed to persist image stage:', error.message);
    }
    await emitToActiveParticipants(io, roomCode, 'image:stage', { roomCode, stage });
    callback?.({ ok: true, stage });
  });

  socket.on('roulette:spin', async (data = {}, callback) => {
    const roomCode = normalizeRoomCode(data.roomCode || socket.data.roomCode);
    const result = String(data.result || '').trim();
    const duration = Math.max(800, Math.min(8000, Number(data.duration) || 2400));
    const options = Array.isArray(data.options) ? data.options.map((option) => String(option || '').trim()).filter(Boolean) : [];
    if (!roomCode || socket.data.role !== 'host' || socket.data.roomCode !== roomCode) {
      callback?.({ ok: false, message: '진행자 방 연결을 확인할 수 없습니다.' });
      return;
    }
    if (!result) {
      callback?.({ ok: false, message: '룰렛 결과가 필요합니다.' });
      return;
    }
    await emitToActiveParticipants(io, roomCode, 'roulette:spin', { roomCode, result, duration, options });
    callback?.({ ok: true, result, duration, options });
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Another server process is running.`);
    console.error('Stop the existing process first, then run `cd server && npm start` again.');
    process.exit(1);
  }

  console.error('Server failed to start:', error);
  process.exit(1);
});

server.listen(PORT, () => {
  const lanUrls = Object.values(os.networkInterfaces())
    .flat()
    .filter((address) => address?.family === 'IPv4' && !address.internal)
    .map((address) => `http://${address.address}:${PORT}`);
  console.log(`Server listening on port ${PORT}`);
  lanUrls.forEach((url) => console.log(`Mobile access URL: ${url}`));
});
