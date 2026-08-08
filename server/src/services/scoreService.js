const { ensureTeamSchema } = require('./teamService');

async function ensureScoreSchema(pool) {
  await ensureTeamSchema(pool);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS room_team_score_events (
      score_event_id INT AUTO_INCREMENT PRIMARY KEY,
      room_id INT NOT NULL,
      team_id INT NOT NULL,
      delta INT NOT NULL,
      reason VARCHAR(255),
      source VARCHAR(40) NOT NULL DEFAULT 'manual',
      event_ref VARCHAR(120),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_score_events_ref (event_ref),
      INDEX idx_score_events_room_created (room_id, created_at),
      CONSTRAINT fk_score_events_room
        FOREIGN KEY (room_id) REFERENCES rooms(room_id)
        ON DELETE CASCADE,
      CONSTRAINT fk_score_events_team
        FOREIGN KEY (team_id) REFERENCES room_teams(team_id)
        ON DELETE CASCADE
    )
  `);
}

async function getScoreboard(pool, roomId) {
  await ensureScoreSchema(pool);
  const [rows] = await pool.execute(
    'SELECT team_id, team_name, score, sort_order FROM room_teams WHERE room_id = ? ORDER BY score DESC, sort_order ASC, team_id ASC',
    [roomId]
  );
  return rows.map((row) => ({
    teamId: row.team_id,
    name: row.team_name,
    score: row.score,
    sortOrder: row.sort_order,
  }));
}

async function changeScore(pool, roomId, teamId, delta, reason = '', source = 'manual', eventRef = null) {
  await ensureScoreSchema(pool);
  const normalizedDelta = Number(delta);
  if (!Number.isFinite(normalizedDelta) || normalizedDelta === 0) {
    throw new Error('점수 변경값이 필요합니다.');
  }

  const [teams] = await pool.execute('SELECT team_id FROM room_teams WHERE room_id = ? AND team_id = ?', [roomId, teamId]);
  if (teams.length === 0) {
    throw new Error('팀을 찾을 수 없습니다.');
  }

  const [eventResult] = await pool.execute(
    `INSERT IGNORE INTO room_team_score_events (room_id, team_id, delta, reason, source, event_ref)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [roomId, teamId, normalizedDelta, String(reason || '').trim(), source, eventRef]
  );

  if (eventRef && eventResult.affectedRows === 0) {
    return getScoreboard(pool, roomId);
  }

  await pool.execute('UPDATE room_teams SET score = score + ? WHERE room_id = ? AND team_id = ?', [normalizedDelta, roomId, teamId]);
  return getScoreboard(pool, roomId);
}

async function awardCorrectAnswersForQuestion(pool, roomId, questionId, points = 1, source = 'auto-answer') {
  await ensureScoreSchema(pool);
  const [answers] = await pool.execute(
    `SELECT a.answer_id, a.member_id, q.answer AS correct_answer, a.answer_text, tm.team_id
     FROM recreation_answers a
     JOIN recreation_questions q ON q.question_id = a.question_id
     JOIN room_team_members tm ON tm.member_id = a.member_id AND tm.room_id = ?
     WHERE a.question_id = ?`,
    [roomId, questionId]
  );

  for (const answer of answers) {
    const correctAnswer = String(answer.correct_answer || '').trim().toLowerCase();
    const submittedAnswer = String(answer.answer_text || '').trim().toLowerCase();
    if (!correctAnswer || correctAnswer !== submittedAnswer) continue;
    await changeScore(
      pool,
      roomId,
      answer.team_id,
      points,
      '정답 자동 반영',
      source,
      `${source}:${questionId}:${answer.member_id}`
    );
  }

  return getScoreboard(pool, roomId);
}

module.exports = {
  awardCorrectAnswersForQuestion,
  changeScore,
  ensureScoreSchema,
  getScoreboard,
};
