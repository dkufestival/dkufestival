const rooms = new Map();

function ack(callback, payload) {
  if (typeof callback === 'function') callback(payload);
}

function getRoom(roomCode) {
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, { musicQuiz: null, answers: new Map() });
  }
  return rooms.get(roomCode);
}

function normalizeAnswer(answer) {
  return String(answer || '').trim().toLowerCase().replace(/\s+/g, '');
}

function publicMusic(music) {
  return {
    id: String(music.id),
    title: music.title,
    artist: music.artist,
    audioUrl: music.audioUrl,
  };
}

function resultForSocket(room, socketId) {
  const submittedAnswer = room.answers.get(socketId)?.answer || null;
  return {
    submittedAnswer,
    isCorrect: submittedAnswer
      ? normalizeAnswer(submittedAnswer) === normalizeAnswer(room.musicQuiz.music.title)
      : false,
    totalSubmissions: room.answers.size,
    correctCount: Array.from(room.answers.values()).filter(
      ({ answer }) => normalizeAnswer(answer) === normalizeAnswer(room.musicQuiz.music.title)
    ).length,
  };
}

async function stopMusicQuiz(io, roomCode) {
  const room = rooms.get(roomCode);
  if (!room?.musicQuiz || room.musicQuiz.status === 'result') return;

  console.log('musicQuizSocket: stopMusicQuiz', { roomCode, music: room.musicQuiz.music?.title });
  room.musicQuiz = { ...room.musicQuiz, status: 'result' };

  const sockets = await io.in(roomCode).fetchSockets();
  for (const roomSocket of sockets) {
    roomSocket.emit('musicQuiz:stop', {
      music: room.musicQuiz.music,
      result: resultForSocket(room, roomSocket.id),
    });
  }
}

function registerMusicQuizHandlers(io, socket) {
  socket.on('musicQuiz:start', async ({ music, playTime } = {}, callback) => {
    const { roomCode, role } = socket.data;
    const durationSeconds = Number(playTime);
    console.log('musicQuizSocket: musicQuiz:start received', { roomCode, role, music: music?.title, playTime });
    if (!roomCode || role !== 'host') {
      ack(callback, { ok: false, message: '진행자 방 연결을 확인할 수 없습니다.' });
      return;
    }
    if (!music?.audioUrl || !music?.title || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      ack(callback, { ok: false, message: '유효한 음악 문제와 재생 시간이 필요합니다.' });
      return;
    }

    const room = getRoom(roomCode);
    room.answers.clear();
    room.musicQuiz = {
      music: publicMusic(music),
      playTime: durationSeconds,
      startedAt: Date.now(),
      status: 'playing',
    };
    const sockets = await io.in(roomCode).fetchSockets();
    sockets
      .filter((roomSocket) => roomSocket.data.role === 'participant' && !roomSocket.data.isReporting)
      .forEach((roomSocket) => {
        roomSocket.emit('musicQuiz:navigate', { roomCode });
        roomSocket.emit('musicQuiz:start', room.musicQuiz);
      });
    ack(callback, { ok: true, musicQuiz: room.musicQuiz });
  });

  socket.on('musicQuiz:sync', (callback) => {
    if (socket.data.role === 'participant' && socket.data.isReporting) {
      ack(callback, { ok: false, message: '개인활동보고 중에는 게임에 참가할 수 없습니다.', musicQuiz: null });
      return;
    }
    const room = rooms.get(socket.data.roomCode);
    if (!room?.musicQuiz) {
      ack(callback, { ok: true, musicQuiz: null });
      return;
    }

    const musicQuiz = {
      ...room.musicQuiz,
      remainingMs: Math.max(0, room.musicQuiz.playTime * 1000 - (Date.now() - room.musicQuiz.startedAt)),
    };
    if (room.musicQuiz.status === 'result') {
      musicQuiz.result = resultForSocket(room, socket.id);
    }
    ack(callback, { ok: true, musicQuiz });
  });

  socket.on('musicQuiz:submitAnswer', async ({ answer } = {}, callback) => {
    const { roomCode, role } = socket.data;
    console.log('musicQuizSocket: submitAnswer', { roomCode, role, nickname: socket.data.nickname, teamName: socket.data.teamName, answer });
    const room = rooms.get(roomCode);
    if (!roomCode || role !== 'participant' || !answer?.trim()) {
      ack(callback, { ok: false, message: '제출할 정답이 필요합니다.' });
      return;
    }
    if (!room?.musicQuiz || room.musicQuiz.status !== 'playing') {
      ack(callback, { ok: false, message: '정답 제출 시간이 종료되었습니다.' });
      return;
    }
    if (socket.data.isReporting) {
      ack(callback, { ok: false, message: '개인활동보고 중에는 게임에 참가할 수 없습니다.' });
      return;
    }
    if (room.answers.has(socket.id)) {
      ack(callback, { ok: false, message: '정답은 한 번만 제출할 수 있습니다.' });
      return;
    }

    const submittedAnswer = {
      playerId: socket.id,
      nickname: socket.data.nickname || '참가자',
      teamName: socket.data.teamName || '미배정',
      answer: answer.trim(),
    };
    room.answers.set(socket.id, submittedAnswer);
    const isCorrect = normalizeAnswer(submittedAnswer.answer) === normalizeAnswer(room.musicQuiz.music.title);
    console.log('musicQuizSocket: submitAnswer stored', { roomCode, submittedAnswer, isCorrect });
    if (isCorrect) {
      const sockets = await io.in(roomCode).fetchSockets();
      sockets
        .filter((roomSocket) => roomSocket.data.role === 'host')
        .forEach((roomSocket) => roomSocket.emit('musicQuiz:correctAnswer', submittedAnswer));
    }
    ack(callback, { ok: true, isCorrect });
  });

  socket.on('musicQuiz:stop', () => {
    if (socket.data.role === 'host') stopMusicQuiz(io, socket.data.roomCode).catch(console.error);
  });

  socket.on('musicQuiz:end', () => {
    const { roomCode, role } = socket.data;
    if (!roomCode || role !== 'host') return;
    const room = getRoom(roomCode);
    room.musicQuiz = null;
    io.to(roomCode).emit('musicQuiz:end', { roomCode });
  });
}

module.exports = { registerMusicQuizHandlers };
