const express = require('express');
const bcrypt = require('bcrypt');
const { getConnection } = require('../db/mysql');

const router = express.Router();

async function getUserColumns(pool) {
  const [columns] = await pool.execute('SHOW COLUMNS FROM users');
  return columns.map((column) => column.Field);
}

function pickColumn(columns, candidates) {
  return candidates.find((column) => columns.includes(column));
}

async function findUserById(userId) {
  const pool = await getConnection();
  const columns = await getUserColumns(pool);
  const idColumns = ['id', 'email', 'user_id', 'nickname'].filter((column) => columns.includes(column));
  const selectColumns = columns.filter((column) => (
    ['id', 'user_id', 'email', 'password_hash', 'password', 'first_name', 'last_name', 'nickname'].includes(column)
  ));

  if (idColumns.length === 0 || selectColumns.length === 0) {
    throw new Error('users 테이블 스키마를 확인해주세요.');
  }

  const whereClause = idColumns.map((column) => `${column} = ?`).join(' OR ');
  const [rows] = await pool.execute(
    `SELECT ${selectColumns.join(', ')} FROM users WHERE ${whereClause} LIMIT 1`,
    idColumns.map(() => userId)
  );
  return rows[0] || null;
}

async function createUser({ id, password, nickname }) {
  const pool = await getConnection();
  const columns = await getUserColumns(pool);
  const idColumn = pickColumn(columns, ['id', 'email', 'user_id']);

  if (!idColumn) {
    throw new Error('users 테이블에 ID 컬럼이 없습니다.');
  }

  const [existing] = await pool.execute(`SELECT ${idColumn} FROM users WHERE ${idColumn} = ?`, [id]);
  if (existing.length > 0) {
    return null;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const insertColumns = [idColumn];
  const values = [id];

  if (columns.includes('password_hash')) {
    insertColumns.push('password_hash');
    values.push(passwordHash);
  } else if (columns.includes('password')) {
    insertColumns.push('password');
    values.push(passwordHash);
  }

  if (columns.includes('nickname')) {
    insertColumns.push('nickname');
    values.push(nickname);
  } else {
    if (columns.includes('first_name')) {
      insertColumns.push('first_name');
      values.push(nickname);
    }
    if (columns.includes('last_name')) {
      insertColumns.push('last_name');
      values.push('');
    }
  }

  const placeholders = insertColumns.map(() => '?').join(', ');
  await pool.execute(
    `INSERT INTO users (${insertColumns.join(', ')}) VALUES (${placeholders})`,
    values
  );

  return { id, nickname };
}

router.post('/login', async (req, res) => {
  const { id, password } = req.body;

  if (!id || !password) {
    return res.status(400).json({ success: false, message: 'ID와 비밀번호를 모두 입력해주세요.' });
  }

  try {
    const user = await findUserById(id);
    if (!user) {
      return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' });
    }

    const inputPassword = String(password);
    const storedHash = user.PASSWORD_HASH || user.password_hash;
    const storedPassword = user.password || user.PASSWORD;

    const passwordMatches = storedHash
      ? await bcrypt.compare(inputPassword, storedHash)
      : String(storedPassword || '').startsWith('$2')
        ? await bcrypt.compare(inputPassword, storedPassword)
        : storedPassword === inputPassword;

    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' });
    }

    return res.json({
      success: true,
      user: {
        id: user.id || user.ID || user.email || user.EMAIL || user.user_id || user.USER_ID,
        userId: user.user_id || user.USER_ID || user.id || user.ID || user.email || user.EMAIL,
        email: user.email || user.EMAIL,
        firstName: user.firstName || user.FIRST_NAME || user.first_name,
        lastName: user.lastName || user.LAST_NAME || user.last_name,
        nickname: user.nickname || user.NICKNAME,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

router.post('/register', async (req, res) => {
  const { nickname, id, password, confirmPassword } = req.body;

  if (!nickname || !id || !password || !confirmPassword) {
    return res.status(400).json({ success: false, message: '모든 필드를 입력해주세요.' });
  }

  if (id.length < 4) {
    return res.status(400).json({ success: false, message: 'ID는 4글자 이상이어야 합니다.' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ success: false, message: '비밀번호가 일치하지 않습니다.' });
  }

  try {
    const newUser = await createUser({ id, password, nickname });
    if (!newUser) {
      return res.status(409).json({ success: false, message: '이미 사용 중인 ID입니다.' });
    }

    return res.json({ success: true, message: '회원가입이 완료되었습니다.' });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
