const gameService = require('../services/game.service');

const sessionRoom = (sessionId) => `session:${sessionId}`;
const gameRoom = (gameId) => `game:${gameId}`;

function participantGame(game) {
  const plain = typeof game?.toJSON === 'function' ? game.toJSON() : game;
  if (!plain || !['OX_QUIZ', 'RPS', 'WORD_GUESS', 'IMAGE_GAME'].includes(plain.type)) return plain;
  const revealed = Boolean(plain.state?.answerRevealed);
  const rounds = (plain.state?.rounds || []).map((round, index) => {
    if (revealed && index === Number(plain.state?.currentRound || 0)) return round;
    const { answer, ...publicRound } = round;
    return publicRound;
  });
  const { answer, responses, ...publicState } = plain.state || {};
  return { ...plain, state: { ...publicState, rounds } };
}

function participantRound(game) {
  const plain = typeof game?.toJSON === 'function' ? game.toJSON() : game;
  const roundIndex = Number(plain?.state?.currentRound || 0);
  const round = plain?.state?.rounds?.[roundIndex] || plain?.state || {};
  const { answer, ...publicRound } = round;
  return { gameId: plain.id, type: plain.type, roundIndex, roundCount: plain?.state?.rounds?.length || 1, round: publicRound };
}

function reply(callback, response) {
  if (typeof callback === 'function') callback(response);
}

function registerGameSocket(io, socket) {
  gameService.getActiveGlobalGame()
    .then((game) => {
      if (game) socket.emit('game:global:current', socket.data.user.role === 'ADMIN' ? game : participantGame(game));
    })
    .catch(() => {});

  // [프론트 연동] 소켓 연결 직후 활성 tableSession의 id로 반드시 한 번 호출해야 합니다.
  socket.on('game:register', async (payload = {}, callback) => {
    try {
      if (socket.data.user.role !== 'PARTICIPANT' || Number(payload.sessionId) !== socket.data.sessionId) {
        throw new Error('INVALID_SESSION');
      }
      reply(callback, { ok: true });
    } catch (error) {
      reply(callback, { ok: false, error: error.code || 'INVALID_PAYLOAD', message: error.message });
    }
  });

  // [프론트 연동] payload: { targetSessionId, type, state? }
  socket.on('game:invite', async (payload = {}, callback) => {
    try {
      if (socket.data.user.role !== 'PARTICIPANT') throw new Error('PARTICIPANT_REQUIRED');
      const fromSessionId = socket.data.sessionId;
      const invite = await gameService.createInvite(fromSessionId, payload);
      io.to(sessionRoom(invite.targetSessionId)).emit('game:invited', invite);
      reply(callback, { ok: true, data: invite });
    } catch (error) {
      reply(callback, { ok: false, error: error.code || 'GAME_ERROR', message: error.message });
    }
  });

  // [프론트 연동] game:invited로 받은 game.id를 gameId로 전달합니다.
  socket.on('game:accept', async (payload = {}, callback) => {
    try {
      if (socket.data.user.role !== 'PARTICIPANT') throw new Error('PARTICIPANT_REQUIRED');
      const sessionId = socket.data.sessionId;
      const game = await gameService.acceptInvite(sessionId, payload);
      const room = gameRoom(game.id);
      io.in(sessionRoom(game.initiatorSessionId)).socketsJoin(room);
      io.in(sessionRoom(game.targetSessionId)).socketsJoin(room);
      io.to(room).emit('game:started', game);
      reply(callback, { ok: true, data: game });
    } catch (error) {
      reply(callback, { ok: false, error: error.code || 'GAME_ERROR', message: error.message });
    }
  });

  // [프론트 연동] payload: { gameId, action, state? }, 수신 이벤트: game:state
  socket.on('game:action', async (payload = {}, callback) => {
    try {
      if (socket.data.user.role !== 'PARTICIPANT') throw new Error('PARTICIPANT_REQUIRED');
      const sessionId = socket.data.sessionId;
      const game = await gameService.handleAction(sessionId, payload, socket.data.participantId);
      if (game.mode === 'GLOBAL') {
        io.to('admins').emit('game:global:state', game);
      } else {
        io.to(gameRoom(game.id)).emit('game:state', game);
      }
      reply(callback, { ok: true, data: game.mode === 'GLOBAL' ? participantGame(game) : game });
    } catch (error) {
      reply(callback, { ok: false, error: error.code || 'GAME_ERROR', message: error.message });
    }
  });

  // [프론트 연동] payload: { gameId, cancelled?, state? }, 수신 이벤트: game:ended
  socket.on('game:end', async (payload = {}, callback) => {
    try {
      if (socket.data.user.role !== 'PARTICIPANT') throw new Error('PARTICIPANT_REQUIRED');
      const sessionId = socket.data.sessionId;
      const game = await gameService.endGame(sessionId, payload);
      io.to(gameRoom(game.id)).emit('game:ended', game);
      reply(callback, { ok: true, data: game });
    } catch (error) {
      reply(callback, { ok: false, error: error.code || 'GAME_ERROR', message: error.message });
    }
  });

  socket.on('game:global:start', async (payload = {}, callback) => {
    try {
      if (socket.data.user.role !== 'ADMIN') throw new Error('ADMIN_REQUIRED');
      const game = await gameService.startGlobalGame(payload);
      io.to('participants').emit('game:global:started', participantGame(game));
      if (game.type !== 'TIME_MATCH') {
        io.to('participants').emit('game:global:round', participantRound(game));
      }
      reply(callback, { ok: true, data: game });
    } catch (error) {
      reply(callback, { ok: false, error: error.code || error.message || 'GAME_ERROR' });
    }
  });

  socket.on('game:global:end', async (payload = {}, callback) => {
    try {
      if (socket.data.user.role !== 'ADMIN') throw new Error('ADMIN_REQUIRED');
      const game = await gameService.endGlobalGame(payload);
      io.to('participants').emit('game:global:ended', game);
      io.to('admins').emit('game:global:ended', game);
      reply(callback, { ok: true, data: game });
    } catch (error) {
      reply(callback, { ok: false, error: error.code || error.message || 'GAME_ERROR' });
    }
  });

  socket.on('game:global:update', async (payload = {}, callback) => {
    try {
      if (socket.data.user.role !== 'ADMIN') throw new Error('ADMIN_REQUIRED');
      const game = await gameService.updateGlobalGame(payload);
      io.to('participants').emit('game:global:updated', participantGame(game));
      if (payload.action === 'NEXT') {
        io.to('participants').emit('game:global:round', participantRound(game));
      } else if (payload.action === 'NEXT_PROMPT') {
        io.to('participants').emit('game:global:prompt', {
          gameId: game.id,
          roundIndex: Number(game.state?.currentRound || 0),
          promptIndex: Number(game.state?.currentPrompt || 0),
        });
      } else if (payload.action === 'SPIN') {
        io.to('participants').emit('game:global:spin', {
          gameId: game.id,
          roundIndex: Number(game.state?.currentRound || 0),
          ...game.state?.rouletteSpin,
        });
      } else if (payload.action === 'REVEAL') {
        const plain = game.toJSON();
        const roundIndex = Number(plain.state?.currentRound || 0);
        io.to('participants').emit('game:global:answer', {
          gameId: plain.id,
          roundIndex,
          answer: plain.state?.rounds?.[roundIndex]?.answer ?? null,
        });
      }
      io.to('admins').emit('game:global:updated', game);
      reply(callback, { ok: true, data: game });
    } catch (error) {
      reply(callback, { ok: false, error: error.code || error.message || 'GAME_ERROR', message: error.message });
    }
  });
}

module.exports = registerGameSocket;
