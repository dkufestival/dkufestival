const express = require('express');
const { getConnection } = require('../db/mysql');
const teamService = require('../services/teamService');
const scoreService = require('../services/scoreService');
const noticeService = require('../services/noticeService');

const router = express.Router();

async function withRoom(roomCode, handler) {
  const pool = await getConnection();
  const room = await teamService.resolveRoom(pool, roomCode);
  if (!room) {
    const error = new Error('방을 찾을 수 없습니다.');
    error.statusCode = 404;
    throw error;
  }
  return handler(pool, room);
}

function sendError(res, error) {
  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || '서버 오류가 발생했습니다.',
  });
}

async function getCollaborationState(pool, room) {
  const [teams, members, scoreboard, notices] = await Promise.all([
    teamService.listTeams(pool, room.room_id),
    teamService.listMembersWithTeams(pool, room.room_id),
    scoreService.getScoreboard(pool, room.room_id),
    noticeService.listNotices(pool, room.room_id),
  ]);

  return {
    roomCode: room.room_code,
    teams,
    members,
    scoreboard,
    notices,
  };
}

router.get('/rooms/:roomCode/collaboration', async (req, res) => {
  try {
    await withRoom(req.params.roomCode, async (pool, room) => {
      const state = await getCollaborationState(pool, room);
      return res.json({ success: true, ...state });
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/rooms/:roomCode/teams/default', async (req, res) => {
  try {
    await withRoom(req.params.roomCode, async (pool, room) => {
      const teams = await teamService.ensureDefaultTeams(pool, room.room_id, req.body?.count || 2);
      return res.json({ success: true, teams });
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.put('/rooms/:roomCode/teams', async (req, res) => {
  try {
    await withRoom(req.params.roomCode, async (pool, room) => {
      const teams = await teamService.saveTeams(pool, room.room_id, req.body?.teams || []);
      return res.json({ success: true, teams });
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/rooms/:roomCode/teams/assign', async (req, res) => {
  try {
    await withRoom(req.params.roomCode, async (pool, room) => {
      const teams = await teamService.assignMember(pool, room.room_id, req.body?.memberId, req.body?.teamId);
      return res.json({ success: true, teams });
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/rooms/:roomCode/teams/randomize', async (req, res) => {
  try {
    await withRoom(req.params.roomCode, async (pool, room) => {
      const teams = await teamService.randomizeTeams(pool, room.room_id, req.body?.teamCount || 2);
      return res.json({ success: true, teams });
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/rooms/:roomCode/scoreboard', async (req, res) => {
  try {
    await withRoom(req.params.roomCode, async (pool, room) => {
      const scoreboard = await scoreService.getScoreboard(pool, room.room_id);
      return res.json({ success: true, scoreboard });
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/rooms/:roomCode/scoreboard/change', async (req, res) => {
  try {
    await withRoom(req.params.roomCode, async (pool, room) => {
      const scoreboard = await scoreService.changeScore(
        pool,
        room.room_id,
        req.body?.teamId,
        req.body?.delta,
        req.body?.reason || '진행자 수동 변경',
        'manual'
      );
      return res.json({ success: true, scoreboard });
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/rooms/:roomCode/host-notices', async (req, res) => {
  try {
    await withRoom(req.params.roomCode, async (pool, room) => {
      const notices = await noticeService.listNotices(pool, room.room_id);
      return res.json({ success: true, notices });
    });
  } catch (error) {
    return sendError(res, error);
  }
});

module.exports = {
  getCollaborationState,
  router,
  withRoom,
};
