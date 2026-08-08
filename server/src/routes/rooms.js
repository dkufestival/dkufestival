const express = require('express');
const { getConnection } = require('../db/mysql');

const router = express.Router();

// 조장님의 6자리 랜덤 방 코드 생성기는 그대로 유지합니다!
function createRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

// [기능 1] 진행자가 방 만들기 버튼을 눌렀을 때 (MySQL DB에 영구 저장)
router.post('/rooms', async (req, res) => {
  const { hostId, title } = req.body; // 프론트엔드에서 보낸 진행자 ID

  if (!hostId) {
    return res.status(400).json({ success: false, message: '호스트 ID(hostId)가 필요합니다.' });
  }

  try {
    const pool = await getConnection();
    let code = createRoomCode();

    // DB에서 방 코드가 이미 존재하는지 중복 체크!
    let [existing] = await pool.execute('SELECT room_code FROM rooms WHERE room_code = ?', [code]);
    while (existing.length > 0) {
      code = createRoomCode();
      [existing] = await pool.execute('SELECT room_code FROM rooms WHERE room_code = ?', [code]);
    }

    // 진짜 MySQL DB 창고에 방 정보 저장! (덮어쓰지 않고 행이 계속 추가되므로 다중 방 개설 가능!)
    await pool.execute(
      'INSERT INTO rooms (room_code, host_id, title) VALUES (?, ?, ?)',
      [code, hostId, title || `${code} 방`]
    );

    return res.status(201).json({
      success: true,
      room: {
        code,
        hostId,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Room create error:', error);
    return res.status(500).json({ success: false, message: '방 생성 중 서버 오류가 발생했습니다.' });
  }
});

// [기능 2] 참가자가 방 코드 입력하고 입장할 때 (DB에서 방 존재 여부 확인)
router.get('/rooms/:code', async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();

  try {
    const pool = await getConnection();
    const [rows] = await pool.execute('SELECT room_code, host_id, created_at FROM rooms WHERE room_code = ?', [code]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '존재하지 않는 방 코드입니다.',
      });
    }

    return res.json({
      success: true,
      room: {
        code: rows[0].room_code,
        hostId: rows[0].host_id,
        createdAt: rows[0].created_at,
      },
    });
  } catch (error) {
    console.error('Get room error:', error);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// [기능 3] 조장님 추가 요구사항: 진행자 로그인 시 자기가 만든 모든 방 목록 불러오기
router.get('/rooms/host/:hostId', async (req, res) => {
  const { hostId } = req.params;

  try {
    const pool = await getConnection();
    const [rows] = await pool.execute(
      'SELECT room_code, created_at FROM rooms WHERE host_id = ? ORDER BY created_at DESC',
      [hostId]
    );

    return res.json({
      success: true,
      rooms: rows
    });
  } catch (error) {
    console.error('Fetch host rooms error:', error);
    return res.status(500).json({ success: false, message: '방 목록 조회 중 서버 오류가 발생했습니다.' });
  }
});

// 소켓 연동을 위한 함수 수정 (DB 기반으로 검증)
router.hasRoom = async (code) => {
  try {
    const pool = await getConnection();
    const [rows] = await pool.execute('SELECT room_code FROM rooms WHERE room_code = ?', [String(code || '').trim().toUpperCase()]);
    return rows.length > 0;
  } catch {
    return false;
  }
};

module.exports = router;
