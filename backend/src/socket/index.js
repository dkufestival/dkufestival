// Socket.IO 핸들러 등록
const registerChatSocket = require('./chat.socket');
const registerGameSocket = require('./game.socket');

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    registerChatSocket(io, socket);
    registerGameSocket(io, socket);
  });
}

module.exports = registerSocketHandlers;
