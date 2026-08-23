const { Op, QueryTypes } = require('sequelize');
const { GameSession, TableSession } = require('../models');

function createServiceError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function requireActiveTableSession(sessionId) {
  const session = await TableSession.findOne({
    where: { id: sessionId, status: 'ACTIVE' },
  });

  if (!session) {
    throw createServiceError('활성화된 테이블 세션을 찾을 수 없습니다.', 'SESSION_NOT_FOUND');
  }

  return session;
}

function requireParticipant(game, sessionId) {
  if (![game.initiatorSessionId, game.targetSessionId].includes(Number(sessionId))) {
    throw createServiceError('해당 게임에 참여할 권한이 없습니다.', 'GAME_FORBIDDEN');
  }
}

async function createInvite(fromSessionId, data) {
  const initiatorSessionId = Number(fromSessionId);
  const targetSessionId = Number(data.targetSessionId);

  if (!initiatorSessionId || !targetSessionId || !data.type) {
    throw createServiceError('fromSessionId, targetSessionId, type이 필요합니다.', 'INVALID_PAYLOAD');
  }
  if (initiatorSessionId === targetSessionId) {
    throw createServiceError('자기 테이블에는 게임을 신청할 수 없습니다.', 'INVALID_TARGET');
  }

  await Promise.all([
    requireActiveTableSession(initiatorSessionId),
    requireActiveTableSession(targetSessionId),
  ]);

  const existingInvite = await GameSession.findOne({
    where: {
      status: { [Op.in]: ['PENDING', 'ACTIVE'] },
      [Op.or]: [
        { initiatorSessionId, targetSessionId },
        { initiatorSessionId: targetSessionId, targetSessionId: initiatorSessionId },
      ],
    },
  });

  if (existingInvite) {
    throw createServiceError('두 테이블 사이에 진행 중인 게임이 있습니다.', 'GAME_ALREADY_EXISTS');
  }

  return GameSession.create({
    mode: 'PAIR',
    type: data.type,
    initiatorSessionId,
    targetSessionId,
    state: data.state || {},
  });
}

async function acceptInvite(sessionId, data) {
  const game = await GameSession.findByPk(data.gameId);
  if (!game) throw createServiceError('게임 초대를 찾을 수 없습니다.', 'GAME_NOT_FOUND');
  if (game.targetSessionId !== Number(sessionId)) {
    throw createServiceError('초대를 수락할 권한이 없습니다.', 'GAME_FORBIDDEN');
  }
  if (game.status !== 'PENDING') {
    throw createServiceError('대기 중인 게임 초대가 아닙니다.', 'INVALID_GAME_STATUS');
  }

  await requireActiveTableSession(sessionId);
  game.status = 'ACTIVE';
  game.startedAt = new Date();
  await game.save();
  return game;
}

async function handleAction(sessionId, data, participantId) {
  const game = await GameSession.findByPk(data.gameId);
  if (!game) throw createServiceError('게임을 찾을 수 없습니다.', 'GAME_NOT_FOUND');
  if (game.mode === 'PAIR') {
    requireParticipant(game, sessionId);
  } else {
    await requireActiveTableSession(sessionId);
  }
  if (game.status !== 'ACTIVE') {
    throw createServiceError('진행 중인 게임이 아닙니다.', 'INVALID_GAME_STATUS');
  }

  let responseState = data.state || {};
  if (game.mode === 'GLOBAL' && game.type === 'TIME_MATCH') {
    const elapsedMs = Number(responseState.elapsedMs);
    const targetMs = Number(game.state?.targetMs);
    if (!Number.isInteger(elapsedMs) || elapsedMs < 0 || !Number.isInteger(targetMs)) {
      throw createServiceError('유효한 시간 기록이 필요합니다.', 'INVALID_TIME_RESULT');
    }
    const differenceMs = elapsedMs - targetMs;
    responseState = {
      elapsedMs,
      targetMs,
      differenceMs,
      success: differenceMs === 0,
      stoppedAt: responseState.stoppedAt || new Date().toISOString(),
    };
  }

  game.state = game.mode === 'GLOBAL'
    ? {
        ...(game.state || {}),
        responses: {
          ...((game.state || {}).responses || {}),
          [participantId || sessionId]: {
            participantId: participantId || null,
            sessionId: Number(sessionId),
            action: data.action || null,
            state: responseState,
            updatedAt: new Date().toISOString(),
          },
        },
      }
    : {
        ...(game.state || {}),
        ...(data.state || {}),
        lastAction: data.action || null,
        lastActorSessionId: Number(sessionId),
        lastActorParticipantId: participantId || null,
        updatedAt: new Date().toISOString(),
      };
  game.changed('state', true);
  await game.save();
  return game;
}

async function endGame(sessionId, data) {
  const game = await GameSession.findByPk(data.gameId);
  if (!game) throw createServiceError('게임을 찾을 수 없습니다.', 'GAME_NOT_FOUND');
  requireParticipant(game, sessionId);
  if (!['PENDING', 'ACTIVE'].includes(game.status)) {
    throw createServiceError('이미 종료된 게임입니다.', 'INVALID_GAME_STATUS');
  }

  game.status = data.cancelled ? 'CANCELLED' : 'ENDED';
  game.state = { ...(game.state || {}), ...(data.state || {}) };
  game.endedAt = new Date();
  game.changed('state', true);
  await game.save();
  return game;
}

async function withGlobalGameLock(work) {
  const sequelize = GameSession.sequelize;
  return sequelize.transaction(async (transaction) => {
    const [lock] = await sequelize.query(
      "SELECT GET_LOCK('festival_global_game', 5) AS acquired",
      { type: QueryTypes.SELECT, transaction }
    );
    if (Number(lock?.acquired) !== 1) {
      throw createServiceError('게임 처리 잠금을 얻지 못했습니다.', 'GLOBAL_GAME_LOCK_TIMEOUT');
    }

    try {
      return await work(transaction);
    } finally {
      await sequelize.query("SELECT RELEASE_LOCK('festival_global_game')", {
        type: QueryTypes.SELECT,
        transaction,
      });
    }
  });
}

async function startGlobalGame(data) {
  if (!data.type) throw createServiceError('게임 종류가 필요합니다.', 'INVALID_PAYLOAD');
  if (data.type === 'TIME_MATCH') {
    const targetMs = Number(data.state?.targetMs);
    if (!Number.isInteger(targetMs) || targetMs < 1 || targetMs > 5999999) {
      throw createServiceError('목표 시간은 1ms 이상 99분 59.999초 이하로 설정해야 합니다.', 'INVALID_TARGET_TIME');
    }
  }
  return withGlobalGameLock(async (transaction) => {
    const activeGame = await GameSession.findOne({
      where: { mode: 'GLOBAL', status: 'ACTIVE' },
      transaction,
    });
    if (activeGame) throw createServiceError('이미 진행 중인 단체 게임이 있습니다.', 'GLOBAL_GAME_ALREADY_ACTIVE');
    return GameSession.create({
      mode: 'GLOBAL',
      type: data.type,
      status: 'ACTIVE',
      state: data.state || {},
      startedAt: new Date(),
    }, { transaction });
  });
}

function getActiveGlobalGame() {
  return GameSession.findOne({
    where: { mode: 'GLOBAL', status: 'ACTIVE' },
    order: [['startedAt', 'DESC'], ['id', 'DESC']],
  });
}

async function endGlobalGame(data) {
  return withGlobalGameLock(async (transaction) => {
    const activeGames = await GameSession.findAll({
      where: { mode: 'GLOBAL', status: 'ACTIVE' },
      transaction,
    });
    const game = activeGames.find((item) => item.id === Number(data.gameId));
    if (!game) throw createServiceError('진행 중인 단체 게임을 찾을 수 없습니다.', 'GLOBAL_GAME_NOT_FOUND');

    const endedAt = new Date();
    await Promise.all(activeGames.map((item) => {
      item.status = 'ENDED';
      item.endedAt = endedAt;
      if (item.id === game.id) {
        item.state = { ...(item.state || {}), ...(data.state || {}) };
        item.changed('state', true);
      }
      return item.save({ transaction });
    }));
    return game;
  });
}

module.exports = { createInvite, acceptInvite, handleAction, endGame, startGlobalGame, endGlobalGame, getActiveGlobalGame };
