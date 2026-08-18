const gameService = require('../services/game.service');

const sessionRoom = (sessionId) => `session:${sessionId}`;
const gameRoom = (gameId) => `game:${gameId}`;

function reply(callback, response) {
  if (typeof callback === 'function') callback(response);
}

function registerGameSocket(io, socket) {
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
      reply(callback, { ok: true, data: game });
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
      io.to('participants').emit('game:global:started', game);
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
      reply(callback, { ok: true, data: game });
    } catch (error) {
      reply(callback, { ok: false, error: error.code || error.message || 'GAME_ERROR' });
    }
  });
}

module.exports = registerGameSocket;
