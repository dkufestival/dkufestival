const mysql = require('mysql2/promise');

let pool;

async function getConnection() {
  if (pool) {
    return pool;
  }

  const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'playce_user',
    password: process.env.DB_PASSWORD || 'playce_password',
    database: process.env.DB_NAME || 'playce',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  };

  pool = mysql.createPool(config);
  return pool;
}

module.exports = {
  getConnection,
};
