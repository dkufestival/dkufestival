async function ensureTeamSchema(pool) {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS room_teams (
      team_id INT AUTO_INCREMENT PRIMARY KEY,
      room_id INT NOT NULL,
      team_name VARCHAR(80) NOT NULL,
      score INT NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_room_teams_name (room_id, team_name),
      INDEX idx_room_teams_room (room_id),
      CONSTRAINT fk_room_teams_room
        FOREIGN KEY (room_id) REFERENCES rooms(room_id)
        ON DELETE CASCADE
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS room_team_members (
      team_member_id INT AUTO_INCREMENT PRIMARY KEY,
      room_id INT NOT NULL,
      team_id INT NOT NULL,
      member_id INT NOT NULL,
      assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_room_team_members_member (room_id, member_id),
      INDEX idx_room_team_members_team (team_id),
      CONSTRAINT fk_room_team_members_room
        FOREIGN KEY (room_id) REFERENCES rooms(room_id)
        ON DELETE CASCADE,
      CONSTRAINT fk_room_team_members_team
        FOREIGN KEY (team_id) REFERENCES room_teams(team_id)
        ON DELETE CASCADE,
      CONSTRAINT fk_room_team_members_member
        FOREIGN KEY (member_id) REFERENCES room_members(member_id)
        ON DELETE CASCADE
    )
  `);
}

async function resolveRoom(pool, roomCode) {
  const code = String(roomCode || '').trim().toUpperCase();
  const [rows] = await pool.execute('SELECT room_id, room_code FROM rooms WHERE room_code = ?', [code]);
  return rows[0] || null;
}

function toTeam(row) {
  return {
    id: row.team_id,
    teamId: row.team_id,
    name: row.team_name,
    score: row.score,
    sortOrder: row.sort_order,
  };
}

async function listTeams(pool, roomId) {
  await ensureTeamSchema(pool);
  const [teams] = await pool.execute(
    'SELECT team_id, team_name, score, sort_order FROM room_teams WHERE room_id = ? ORDER BY sort_order ASC, team_id ASC',
    [roomId]
  );
  const [members] = await pool.execute(
    `SELECT tm.team_id, m.member_id, m.nickname, m.organization, m.student_number
     FROM room_team_members tm
     JOIN room_members m ON tm.member_id = m.member_id
     WHERE tm.room_id = ?
     ORDER BY m.joined_at ASC, m.member_id ASC`,
    [roomId]
  );

  return teams.map((team) => ({
    ...toTeam(team),
    members: members
      .filter((member) => member.team_id === team.team_id)
      .map((member) => ({
        memberId: member.member_id,
        name: member.nickname,
        organization: member.organization || '',
        studentNumber: member.student_number || '',
      })),
  }));
}

async function listMembersWithTeams(pool, roomId) {
  await ensureTeamSchema(pool);
  const [rows] = await pool.execute(
    `SELECT m.member_id, m.nickname, m.organization, m.student_number,
            t.team_id, t.team_name, t.score
     FROM room_members m
     LEFT JOIN room_team_members tm ON tm.member_id = m.member_id AND tm.room_id = m.room_id
     LEFT JOIN room_teams t ON t.team_id = tm.team_id
     WHERE m.room_id = ?
     ORDER BY m.joined_at ASC, m.member_id ASC`,
    [roomId]
  );

  return rows.map((row) => ({
    memberId: row.member_id,
    name: row.nickname,
    organization: row.organization || '',
    studentNumber: row.student_number || '',
    team: row.team_id ? { teamId: row.team_id, name: row.team_name, score: row.score } : null,
  }));
}

async function ensureDefaultTeams(pool, roomId, count = 2) {
  await ensureTeamSchema(pool);
  const teamCount = Math.max(1, Math.min(Number(count) || 2, 12));
  for (let index = 0; index < teamCount; index += 1) {
    const name = `Team ${String.fromCharCode(65 + index)}`;
    await pool.execute(
      `INSERT INTO room_teams (room_id, team_name, sort_order)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order)`,
      [roomId, name, index + 1]
    );
  }
  return listTeams(pool, roomId);
}

async function saveTeams(pool, roomId, teams) {
  await ensureTeamSchema(pool);
  const normalizedTeams = (Array.isArray(teams) ? teams : [])
    .map((team, index) => ({
      teamId: team.teamId || team.id || null,
      name: String(team.name || '').trim() || `Team ${String.fromCharCode(65 + index)}`,
      sortOrder: Number(team.sortOrder) || index + 1,
    }))
    .filter((team) => team.name);

  for (const team of normalizedTeams) {
    if (team.teamId) {
      await pool.execute(
        'UPDATE room_teams SET team_name = ?, sort_order = ? WHERE room_id = ? AND team_id = ?',
        [team.name, team.sortOrder, roomId, team.teamId]
      );
    } else {
      await pool.execute(
        `INSERT INTO room_teams (room_id, team_name, sort_order)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order)`,
        [roomId, team.name, team.sortOrder]
      );
    }
  }

  return listTeams(pool, roomId);
}

async function assignMember(pool, roomId, memberId, teamId) {
  await ensureTeamSchema(pool);
  const [teams] = await pool.execute('SELECT team_id FROM room_teams WHERE room_id = ? AND team_id = ?', [roomId, teamId]);
  if (teams.length === 0) {
    throw new Error('팀을 찾을 수 없습니다.');
  }

  const [members] = await pool.execute('SELECT member_id FROM room_members WHERE room_id = ? AND member_id = ?', [roomId, memberId]);
  if (members.length === 0) {
    throw new Error('참가자를 찾을 수 없습니다.');
  }

  await pool.execute(
    `INSERT INTO room_team_members (room_id, team_id, member_id)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE team_id = VALUES(team_id), assigned_at = CURRENT_TIMESTAMP`,
    [roomId, teamId, memberId]
  );
  return listTeams(pool, roomId);
}

async function randomizeTeams(pool, roomId, teamCount = 2) {
  const teams = await ensureDefaultTeams(pool, roomId, teamCount);
  const [members] = await pool.execute(
    'SELECT member_id FROM room_members WHERE room_id = ? ORDER BY RAND()',
    [roomId]
  );

  if (teams.length === 0) return [];

  for (const [index, member] of members.entries()) {
    await assignMember(pool, roomId, member.member_id, teams[index % teams.length].teamId);
  }

  return listTeams(pool, roomId);
}

module.exports = {
  assignMember,
  ensureDefaultTeams,
  ensureTeamSchema,
  listMembersWithTeams,
  listTeams,
  randomizeTeams,
  resolveRoom,
  saveTeams,
};
