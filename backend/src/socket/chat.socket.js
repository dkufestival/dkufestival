// 채팅 Socket.IO 이벤트를 등록
const chatService = require('../services/chat.service');

function registerChatSocket(io, socket) {
  socket.on('chat:join', async (payload, callback) => {
    // TODO: 채팅방 입장 전에 세션 접근 권한을 검증한다.
    socket.join(`chat:${payload.roomId}`);
    if (callback) callback({ ok: true });
  });

  socket.on('chat:send', async (payload, callback) => {
    // TODO: 소켓 인증과 채팅방 참여자 검증을 추가한다.
    const message = await chatService.sendMessage(
      payload.roomId,
      payload.senderSessionId,
      payload.content
    );

    io.to(`chat:${payload.roomId}`).emit('chat:message', message);
    if (callback) callback({ ok: true, data: message });
  });
}

module.exports = registerChatSocket;
