// .env 로드와 환경변수 기본값을 한 곳에서 관리
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
  quiet: true,
});

const env = {
  port: Number(process.env.PORT || 3000),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  sessionDurationMinutes: Number(process.env.SESSION_DURATION_MINUTES || 120),
  qrOutputDir: process.env.QR_OUTPUT_DIR || path.resolve(__dirname, '../../qr-codes'),
  admin: {
    id: process.env.ADMIN_ID || 'admin',
    password: process.env.ADMIN_PASSWORD || null,
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'festival',
    logging: process.env.DB_LOGGING === 'true',
    sync: process.env.DB_SYNC !== 'false',
    alter: process.env.DB_ALTER === 'true',
  },
  tableCount: Number(process.env.TABLE_COUNT || 20),
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  },
};

module.exports = env;
