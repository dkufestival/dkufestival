// 애플리케이션 진입점: 환경변수 로드, HTTP 서버 생성, Socket.IO 초기화를 담당
require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const registerSocketHandlers = require('./socket');

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  },
});

registerSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`Festival backend listening on port ${PORT}`);
});
