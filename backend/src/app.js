// Express 앱 설정과 REST 라우트 등록을 담당
const express = require('express');
const cors = require('cors');

const tableRoutes = require('./routes/table.routes');
const joinRoutes = require('./routes/join.routes');
const chatRoutes = require('./routes/chat.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/tables', tableRoutes);
app.use('/api/join-requests', joinRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);

module.exports = app;
