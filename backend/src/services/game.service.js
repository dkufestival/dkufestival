const { Op } = require('sequelize');
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

async function handleAction(sessionId, data) {
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

  game.state = game.mode === 'GLOBAL'
    ? {
        ...(game.state || {}),
        responses: {
          ...((game.state || {}).responses || {}),
          [sessionId]: { action: data.action || null, state: data.state || {}, updatedAt: new Date().toISOString() },
        },
      }
    : {
        ...(game.state || {}),
        ...(data.state || {}),
        lastAction: data.action || null,
        lastActorSessionId: Number(sessionId),
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

async function startGlobalGame(data) {
  const activeGame = await GameSession.findOne({ where: { mode: 'GLOBAL', status: 'ACTIVE' } });
  if (activeGame) throw createServiceError('이미 진행 중인 단체 게임이 있습니다.', 'GLOBAL_GAME_ALREADY_ACTIVE');
  return GameSession.create({
    mode: 'GLOBAL',
    type: data.type,
    status: 'ACTIVE',
    state: data.state || {},
    startedAt: new Date(),
  });
}

async function endGlobalGame(data) {
  const game = await GameSession.findOne({ where: { id: data.gameId, mode: 'GLOBAL', status: 'ACTIVE' } });
  if (!game) throw createServiceError('진행 중인 단체 게임을 찾을 수 없습니다.', 'GLOBAL_GAME_NOT_FOUND');
  game.status = 'ENDED';
  game.state = { ...(game.state || {}), ...(data.state || {}) };
  game.endedAt = new Date();
  game.changed('state', true);
  await game.save();
  return game;
}

module.exports = { createInvite, acceptInvite, handleAction, endGame, startGlobalGame, endGlobalGame };
