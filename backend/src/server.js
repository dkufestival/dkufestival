// 애플리케이션 진입점: HTTP 서버 생성과 Socket.IO 초기화를 담당
const http = require('http');
const { Server } = require('socket.io');
const env = require('./config/env');
const app = require('./app');
const sequelize = require('./config/db');
const registerSocketHandlers = require('./socket');
const chatService = require('./services/chat.service');
const lifecycleService = require('./services/lifecycle.service');

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: env.corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  },
});

app.set('io', io);
registerSocketHandlers(io);

function startLifecycleJobs() {
  setInterval(async () => {
    try {
      const expiredRequests = await chatService.expirePendingRooms();
      expiredRequests.forEach((room) => {
        io.to(`session:${room.requesterSessionId}`).to(`session:${room.targetSessionId}`).emit('chat:request-expired', room);
      });
      const expiredSessions = await lifecycleService.expireSessions();
      expiredSessions.forEach((result) => lifecycleService.emitLifecycle(io, result));
    } catch (error) {
      console.warn('Lifecycle cleanup failed', error.message);
    }
  }, 15 * 1000);
}

async function startServer() {
  try {
    await sequelize.authenticate();
    if (env.db.sync) await sequelize.sync({ alter: env.db.alter });

    server.listen(env.port, () => {
      console.log(`Festival backend listening on port ${env.port}`);
    });
    startLifecycleJobs();
  } catch (error) {
    console.error('데이터베이스 연결에 실패해 서버를 시작할 수 없습니다.', error);
    process.exitCode = 1;
  }
}

startServer();
