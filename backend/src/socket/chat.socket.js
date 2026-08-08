const chatService = require('../services/chat.service');

function reply(callback, response) {
  if (typeof callback === 'function') callback(response);
}

function registerChatSocket(io, socket) {
  socket.on('chat:join', async (payload = {}, callback) => {
    try {
      if (socket.data.user.role !== 'PARTICIPANT') throw new Error('PARTICIPANT_REQUIRED');
      await chatService.requireRoomMember(payload.roomId, socket.data.sessionId);
      await socket.join(`chat:${payload.roomId}`);
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
        payload.content
      );
      io.to(`chat:${payload.roomId}`).emit('chat:message', message);
      reply(callback, { ok: true, data: message });
    } catch (error) {
      reply(callback, { ok: false, error: error.code || error.message || 'CHAT_ERROR' });
    }
  });
}

module.exports = registerChatSocket;
