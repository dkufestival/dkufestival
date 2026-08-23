// Express 앱 설정과 REST 라우트 등록을 담당
const express = require('express');
const cors = require('cors');
const path = require('path');
const env = require('./config/env');

const tableRoutes = require('./routes/table.routes');
const chatRoutes = require('./routes/chat.routes');
const adminRoutes = require('./routes/admin.routes');
const noticeRoutes = require('./routes/notice.routes');
const entryRoutes = require('./routes/entry.routes');
const participantRoutes = require('./routes/participant.routes');
const songRoutes = require('./routes/song.routes');
const pushRoutes = require('./routes/push.routes');
const { notFound, errorHandler } = require('./middleware/error-handler');

const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/tables', tableRoutes);
app.use('/api/entry', entryRoutes);
app.use('/api/participants', participantRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/song-requests', songRoutes);
app.use('/api/push', pushRoutes);

// API와 같은 Express 서버에서 사용자 화면, 관리자 화면, 미니게임을
// 함께 제공한다. 별도의 프런트엔드/게임 개발 서버가 필요하지 않다.
app.use(express.static(path.resolve(__dirname, '../../frontend')));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
