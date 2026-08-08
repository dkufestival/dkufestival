async function ensureNoticeSchema(pool) {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS room_host_notices (
      notice_id INT AUTO_INCREMENT PRIMARY KEY,
      room_id INT NOT NULL,
      message VARCHAR(500) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_room_host_notices_room_created (room_id, created_at),
      CONSTRAINT fk_room_host_notices_room
        FOREIGN KEY (room_id) REFERENCES rooms(room_id)
        ON DELETE CASCADE
    )
  `);
}

async function createNotice(pool, roomId, message) {
  await ensureNoticeSchema(pool);
  const normalizedMessage = String(message || '').trim();
  if (!normalizedMessage) {
    throw new Error('공지 내용을 입력해주세요.');
  }
  if (normalizedMessage.length > 500) {
    throw new Error('공지는 500자 이하로 입력해주세요.');
  }

  const [result] = await pool.execute(
    'INSERT INTO room_host_notices (room_id, message) VALUES (?, ?)',
    [roomId, normalizedMessage]
  );

  return {
    noticeId: result.insertId,
    id: result.insertId,
    message: normalizedMessage,
    createdAt: new Date().toISOString(),
  };
}

async function listNotices(pool, roomId, limit = 20) {
  await ensureNoticeSchema(pool);
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
  const [rows] = await pool.execute(
    `SELECT notice_id, message, created_at
     FROM room_host_notices
     WHERE room_id = ?
     ORDER BY created_at DESC, notice_id DESC
     LIMIT ${normalizedLimit}`,
    [roomId]
  );

  return rows.map((row) => ({
    noticeId: row.notice_id,
    id: row.notice_id,
    message: row.message,
    createdAt: row.created_at,
  }));
}

module.exports = {
  createNotice,
  ensureNoticeSchema,
  listNotices,
};
