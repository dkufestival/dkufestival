// 게임 Socket.IO 이벤트를 등록
const gameService = require('../services/game.service');

function registerGameSocket(io, socket) {
  socket.on('game:invite', async (payload, callback) => {
    // TODO: 대상 세션의 소켓 룸을 찾아 게임 초대를 전달한다.
    const invite = await gameService.createInvite(payload.fromSessionId, payload);
    socket.broadcast.emit('game:invited', invite);
    if (callback) callback({ ok: true, data: invite });
  });

  socket.on('game:accept', async (payload, callback) => {
    // TODO: 초대를 수락한 세션들 사이의 게임을 시작한다.
    const game = await gameService.acceptInvite(payload.sessionId, payload);
    io.emit('game:started', game);
    if (callback) callback({ ok: true, data: game });
  });

  socket.on('game:action', async (payload, callback) => {
    // TODO: 해당 게임 세션 참여자에게만 상태를 브로드캐스트한다.
    const state = await gameService.handleAction(payload.sessionId, payload);
    io.emit('game:state', state);
    if (callback) callback({ ok: true, data: state });
  });
}

module.exports = registerGameSocket;
