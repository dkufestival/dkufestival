// 애플리케이션 진입점: HTTP 서버 생성과 Socket.IO 초기화를 담당
const http = require('http');
const { Server } = require('socket.io');
const env = require('./config/env');
const app = require('./app');
const registerSocketHandlers = require('./socket');

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: env.corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  },
});

registerSocketHandlers(io);

server.listen(env.port, () => {
  console.log(`Festival backend listening on port ${env.port}`);
});
