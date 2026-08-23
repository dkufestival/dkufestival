const chatService = require('../services/chat.service');

function reply(callback, response) {
  if (typeof callback === 'function') callback(response);
}

function roomName(roomId) {
  return `chat:${roomId}`;
}

function registerChatSocket(io, socket) {
  if (socket.data.user.role === 'PARTICIPANT' && socket.data.sessionId) {
    chatService.getActive(socket.data.sessionId)
      .then(async (room) => {
        if (!room) return;
        await socket.join(roomName(room.id));
        socket.emit('chat:active', room);
      })
      .catch(() => {});
  }

  socket.on('chat:join', async (payload = {}, callback) => {
    try {
      if (socket.data.user.role !== 'PARTICIPANT') throw new Error('PARTICIPANT_REQUIRED');
      await chatService.requireRoomMember(payload.roomId, socket.data.sessionId);
      await socket.join(roomName(payload.roomId));
      reply(callback, { ok: true });
    } catch (error) {
      reply(callback, { ok: false, error: error.code || error.message || 'CHAT_ERROR' });
    }
  });

  socket.on('chat:send', async (payload = {}, callback) => {
    try {
      if (socket.data.user.role !== 'PARTICIPANT') throw new Error('PARTICIPANT_REQUIRED');
      const message = await chatService.sendMessage(
        payload.roomId,
        socket.data.sessionId,
        socket.data.participantId,
        payload.content
      );
      io.to(roomName(payload.roomId)).emit('chat:message', message);
      reply(callback, { ok: true, data: message });
    } catch (error) {
      reply(callback, { ok: false, error: error.code || error.message || 'CHAT_ERROR' });
    }
  });
}

module.exports = registerChatSocket;
