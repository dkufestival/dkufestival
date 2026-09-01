const globalChatService = require('../services/globalChat.service');

function reply(callback, response) {
  if (typeof callback === 'function') callback(response);
}

function registerGlobalChatSocket(io, socket) {
  socket.on('globalChat:send', async (payload = {}, callback) => {
    try {
      const message = socket.data.user.role === 'ADMIN'
        ? await globalChatService.sendAsAdmin(payload.content)
        : await globalChatService.sendAsParticipant(
          socket.data.sessionId,
          socket.data.participantId,
          payload.content
        );
      io.to('participants').to('admins').emit('globalChat:message', message);
      reply(callback, { ok: true, data: message });
    } catch (error) {
      reply(callback, {
        ok: false,
        error: error.code || 'GLOBAL_CHAT_ERROR',
        message: error.message || '메시지 전송에 실패했습니다.',
      });
    }
  });
}

module.exports = registerGlobalChatSocket;
