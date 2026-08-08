const { getConnection } = require('./db/mysql');
const { getCollaborationState, withRoom } = require('./routes/collaboration');
const teamService = require('./services/teamService');
const scoreService = require('./services/scoreService');
const noticeService = require('./services/noticeService');

function normalizeRoomCode(roomCode) {
  return String(roomCode || '').trim().toUpperCase();
}

function requireHost(socket, roomCode, callback) {
  if (socket.data.roomCode !== roomCode || socket.data.role !== 'host') {
    callback?.({ ok: false, message: '진행자 방 연결을 확인할 수 없습니다.' });
    return false;
  }
  return true;
}

async function emitState(io, roomCode) {
  const state = await withRoom(roomCode, getCollaborationState);
  const roomSockets = await io.in(roomCode).fetchSockets();
  roomSockets
    .filter((roomSocket) => roomSocket.data.role === 'participant' && roomSocket.data.memberId)
    .forEach((roomSocket) => {
      const member = state.members.find((item) => String(item.memberId) === String(roomSocket.data.memberId));
      roomSocket.data.teamName = member?.team?.name || '미배정';
    });
  io.to(roomCode).emit('team:update', { roomCode, teams: state.teams, members: state.members });
  io.to(roomCode).emit('score:changed', { roomCode, scoreboard: state.scoreboard });
  return state;
}

function registerCollaborationHandlers(io, socket) {
  socket.on('collaboration:sync', async (data = {}, callback) => {
    const roomCode = normalizeRoomCode(data.roomCode || socket.data.roomCode);
    if (!roomCode) {
      callback?.({ ok: false, message: '방 코드가 필요합니다.' });
      return;
    }

    try {
      const state = await withRoom(roomCode, getCollaborationState);
      callback?.({ ok: true, ...state });
    } catch (error) {
      callback?.({ ok: false, message: error.message });
    }
  });

  socket.on('team:update', async (data = {}, callback) => {
    const roomCode = normalizeRoomCode(data.roomCode);
    if (!roomCode || !requireHost(socket, roomCode, callback)) return;

    try {
      await withRoom(roomCode, (pool, room) => teamService.saveTeams(pool, room.room_id, data.teams || []));
      const state = await emitState(io, roomCode);
      callback?.({ ok: true, teams: state.teams, members: state.members });
    } catch (error) {
      callback?.({ ok: false, message: error.message });
    }
  });

  socket.on('team:assign', async (data = {}, callback) => {
    const roomCode = normalizeRoomCode(data.roomCode);
    if (!roomCode || !requireHost(socket, roomCode, callback)) return;

    try {
      await withRoom(roomCode, (pool, room) => teamService.assignMember(pool, room.room_id, data.memberId, data.teamId));
      const state = await emitState(io, roomCode);
      callback?.({ ok: true, teams: state.teams, members: state.members });
    } catch (error) {
      callback?.({ ok: false, message: error.message });
    }
  });

  socket.on('team:randomize', async (data = {}, callback) => {
    const roomCode = normalizeRoomCode(data.roomCode);
    if (!roomCode || !requireHost(socket, roomCode, callback)) return;

    try {
      await withRoom(roomCode, (pool, room) => teamService.randomizeTeams(pool, room.room_id, data.teamCount || 2));
      const state = await emitState(io, roomCode);
      callback?.({ ok: true, teams: state.teams, members: state.members });
    } catch (error) {
      callback?.({ ok: false, message: error.message });
    }
  });

  socket.on('score:update', async (data = {}, callback) => {
    const roomCode = normalizeRoomCode(data.roomCode);
    if (!roomCode || !requireHost(socket, roomCode, callback)) return;

    try {
      const scoreboard = await withRoom(roomCode, (pool, room) => scoreService.changeScore(
        pool,
        room.room_id,
        data.teamId,
        data.delta,
        data.reason || '진행자 수동 변경',
        'manual'
      ));
      io.to(roomCode).emit('score:changed', { roomCode, scoreboard });
      callback?.({ ok: true, scoreboard });
    } catch (error) {
      callback?.({ ok: false, message: error.message });
    }
  });

  socket.on('notice:send', async (data = {}, callback) => {
    const roomCode = normalizeRoomCode(data.roomCode);
    if (!roomCode || !requireHost(socket, roomCode, callback)) return;

    try {
      const pool = await getConnection();
      const room = await teamService.resolveRoom(pool, roomCode);
      if (!room) {
        callback?.({ ok: false, message: '방을 찾을 수 없습니다.' });
        return;
      }

      const notice = await noticeService.createNotice(pool, room.room_id, data.message);
      io.to(roomCode).emit('notice:received', { roomCode, notice });
      callback?.({ ok: true, notice });
    } catch (error) {
      callback?.({ ok: false, message: error.message });
    }
  });
}

module.exports = {
  registerCollaborationHandlers,
};
