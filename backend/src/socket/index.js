// Socket.IO 핸들러 등록
const registerChatSocket = require('./chat.socket');
const registerGameSocket = require('./game.socket');
const socketAuth = require('./auth.socket');

function registerSocketHandlers(io) {
  io.use(socketAuth);
  io.on('connection', (socket) => {
    socket.join(socket.data.user.role === 'ADMIN' ? 'admins' : 'participants');
    if (socket.data.sessionId) socket.join(`session:${socket.data.sessionId}`);
    if (socket.data.participantId) socket.join(`participant:${socket.data.participantId}`);
    registerChatSocket(io, socket);
    registerGameSocket(io, socket);
  });
}

module.exports = registerSocketHandlers;
