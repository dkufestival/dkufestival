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
  if (game.mode === 'GLOBAL' && ['OX_QUIZ', 'WORD_GUESS', 'IMAGE_GAME'].includes(game.type)) {
    const submitted = String(responseState.answer || '').trim();
    const round = game.state?.rounds?.[Number(game.state?.currentRound || 0)] || game.state || {};
    const expected = String(round.answer || '').trim();
    responseState = {
      ...responseState,
      answer: submitted,
      success: submitted.localeCompare(expected, 'ko', { sensitivity: 'base' }) === 0,
    };
  }
  if (game.mode === 'GLOBAL' && game.type === 'RPS') {
    const submitted = String(responseState.answer || '').trim();
    const round = game.state?.rounds?.[Number(game.state?.currentRound || 0)] || {};
    const hostHand = String(round.answer || '').trim();
    const winsAgainst = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
    const outcome = submitted === hostHand ? 'DRAW' : winsAgainst[submitted] === hostHand ? 'WIN' : 'LOSE';
    responseState = { ...responseState, answer: submitted, hostHand, outcome };
  }

  if (game.mode === 'GLOBAL' && data.action === 'PARTICIPATION') {
    game.state = {
      ...(game.state || {}),
      participants: {
        ...((game.state || {}).participants || {}),
        [participantId || sessionId]: {
          participantId: participantId || null,
          sessionId: Number(sessionId),
          joined: Boolean(data.state?.joined),
          updatedAt: new Date().toISOString(),
        },
      },
    };
    game.changed('state', true);
    await game.save();
    return game;
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

function normalizedAnswer(value) {
  return String(value || '').trim().toLocaleLowerCase('ko');
}

function rpsScore(player, host) {
  if (player === host) return 4;
  const winsAgainst = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
  return winsAgainst[player] === host ? 10 : 0;
}

async function scoreCurrentRound(game) {
  const state = game.state || {};
  const roundIndex = Number(state.currentRound || 0);
  if (state.scoredRounds?.[roundIndex]) return state.scoreboard || [];
  if (!['OX_QUIZ', 'RPS', 'WORD_GUESS', 'IMAGE_GAME'].includes(game.type)) return state.scoreboard || [];

  const round = state.rounds?.[roundIndex] || {};
  const responses = Object.values(state.responses || {}).filter((response) => (
    Number(response.state?.roundIndex) === roundIndex && response.state?.answer
  ));
  const joined = Object.values(state.participants || {}).filter((entry) => entry.joined);
  const participantGroups = new Map();
  (joined.length ? joined : responses).forEach((entry) => {
    const sessionId = Number(entry.sessionId);
    if (!participantGroups.has(sessionId)) participantGroups.set(sessionId, new Set());
    participantGroups.get(sessionId).add(Number(entry.participantId || sessionId));
  });

  const totals = new Map();
  responses.forEach((response) => {
    const sessionId = Number(response.sessionId);
    const submitted = normalizedAnswer(response.state?.answer);
    const expected = normalizedAnswer(round.answer);
    let points = 0;
    if (game.type === 'RPS') points = rpsScore(submitted, expected);
    else if (submitted === expected) points = 50;
    totals.set(sessionId, (totals.get(sessionId) || 0) + points);
  });

  const sessionIds = new Set([...participantGroups.keys(), ...totals.keys()]);
  const deltas = [];
  for (const sessionId of sessionIds) {
    const rawTotal = totals.get(sessionId) || 0;
    let delta = rawTotal;
    if (game.type === 'OX_QUIZ') {
      const count = Math.max(1, participantGroups.get(sessionId)?.size || 0);
      delta = Math.round((rawTotal / count) / 10) * 10;
    } else if (game.type === 'RPS') {
      const count = Math.max(1, participantGroups.get(sessionId)?.size || 0);
      delta = Math.round(rawTotal / count);
    }
    if (delta) await TableSession.increment('score', { by: delta, where: { id: sessionId } });
    deltas.push({ sessionId, delta });
  }

  const sessions = await TableSession.findAll({
    where: { status: 'ACTIVE' },
    include: [{ association: 'table', attributes: ['tableNumber'] }],
    order: [['score', 'DESC'], ['id', 'ASC']],
  });
  return sessions.map((session) => ({
    sessionId: session.id,
    tableNumber: session.table?.tableNumber,
    score: Number(session.score || 0),
    delta: deltas.find((item) => item.sessionId === session.id)?.delta || 0,
  }));
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

function normalizePinballEntries(values) {
  if (!Array.isArray(values) || !values.length || values.length > 50) return null;
  const entries = [];
  let marbleCount = 0;

  for (const rawValue of values) {
    const value = String(rawValue).trim();
    const match = /^([^,/*]+?)(?:\*(\d+))?$/.exec(value);
    const name = match?.[1]?.trim();
    const count = Number(match?.[2] || 1);
    if (!name || name.length > 20 || !Number.isInteger(count) || count < 1 || count > 50) return null;
    marbleCount += count;
    if (marbleCount > 50) return null;
    entries.push(count > 1 ? `${name}*${count}` : name);
  }

  if (marbleCount < 2) return null;
  return { entries, marbleCount };
}

async function startGlobalGame(data) {
  if (!data.type) throw createServiceError('게임 종류가 필요합니다.', 'INVALID_PAYLOAD');
  const globalTypes = ['TIME_MATCH', 'PINBALL', 'OX_QUIZ', 'RPS', 'WORD_GUESS', 'ROULETTE', 'IMAGE_GAME'];
  if (!globalTypes.includes(data.type)) throw createServiceError('지원하지 않는 전체 게임입니다.', 'INVALID_GAME_TYPE');
  if (data.type === 'TIME_MATCH') {
    const targetMs = Number(data.state?.targetMs);
    if (!Number.isInteger(targetMs) || targetMs < 1 || targetMs > 5999999) {
      throw createServiceError('목표 시간은 1ms 이상 99분 59.999초 이하로 설정해야 합니다.', 'INVALID_TARGET_TIME');
    }
  }
  let gameState = data.state || {};
  if (data.type === 'PINBALL') {
    const parsed = normalizePinballEntries(gameState.names);
    if (!parsed) throw createServiceError('핀볼 구슬은 이름 또는 이름*개수 형식으로 총 2~50개를 입력해야 합니다.', 'INVALID_PINBALL_NAMES');
    gameState = {
      startedBy: 'admin',
      names: parsed.entries,
      marbleCount: parsed.marbleCount,
      seed: Math.floor(Math.random() * 0xffffffff) || 1,
      startAt: Date.now() + 2000,
    };
  } else if (data.type !== 'TIME_MATCH') {
    const rounds = data.state?.rounds;
    if (!Array.isArray(rounds) || !rounds.length) throw createServiceError('라운드를 1개 이상 추가해야 합니다.', 'INVALID_GAME_CONFIG');
    const invalid = rounds.some((round) => {
      if (data.type === 'OX_QUIZ') return !String(round.prompt || '').trim() || !['O', 'X'].includes(round.answer);
      if (data.type === 'RPS') return !['rock', 'scissors', 'paper'].includes(round.answer);
      if (data.type === 'WORD_GUESS') return (!Array.isArray(round.prompts) || !round.prompts.length) || !String(round.answer || '').trim();
      if (data.type === 'ROULETTE') return !Array.isArray(round.options) || round.options.length < 2;
      if (data.type === 'IMAGE_GAME') return !String(round.imageUrl || '').trim() || !String(round.answer || '').trim();
      return false;
    });
    if (invalid) throw createServiceError('모든 라운드의 필수 설정을 입력해주세요.', 'INVALID_GAME_CONFIG');
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
      state: gameState,
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

async function updateGlobalGame(data) {
  const game = await GameSession.findOne({ where: { id: Number(data.gameId), mode: 'GLOBAL', status: 'ACTIVE' } });
  if (!game) throw createServiceError('진행 중인 단체 게임을 찾을 수 없습니다.', 'GLOBAL_GAME_NOT_FOUND');
  const rounds = game.state?.rounds || [];
  const currentRound = Number(game.state?.currentRound || 0);
  if (data.action === 'REVEAL') {
    const scoreboard = await scoreCurrentRound(game);
    game.state = {
      ...(game.state || {}),
      answerRevealed: true,
      scoreboard,
      scoredRounds: { ...((game.state || {}).scoredRounds || {}), [currentRound]: true },
    };
  } else if (data.action === 'SPIN') {
    if (game.type !== 'ROULETTE') throw createServiceError('룰렛 게임이 아닙니다.', 'INVALID_GAME_ACTION');
    const options = rounds[currentRound]?.options || [];
    if (options.length < 2) throw createServiceError('룰렛 옵션이 부족합니다.', 'INVALID_GAME_CONFIG');
    const resultIndex = Math.floor(Math.random() * options.length);
    game.state = {
      ...(game.state || {}),
      rouletteSpin: { resultIndex, result: options[resultIndex], spinId: Date.now(), durationMs: 4200 },
    };
  } else if (data.action === 'NEXT_PROMPT') {
    if (game.type !== 'WORD_GUESS') throw createServiceError('제시어 맞히기 게임이 아닙니다.', 'INVALID_GAME_ACTION');
    const prompts = rounds[currentRound]?.prompts || [];
    const currentPrompt = Number(game.state?.currentPrompt || 0);
    if (currentPrompt >= prompts.length - 1) throw createServiceError('마지막 제시어입니다.', 'LAST_PROMPT');
    game.state = { ...(game.state || {}), currentPrompt: currentPrompt + 1 };
  } else if (data.action === 'NEXT') {
    if (currentRound >= rounds.length - 1) throw createServiceError('마지막 라운드입니다.', 'LAST_ROUND');
    game.state = { ...(game.state || {}), currentRound: currentRound + 1, currentPrompt: 0, answerRevealed: false, rouletteSpin: null };
  } else {
    throw createServiceError('지원하지 않는 게임 진행 명령입니다.', 'INVALID_GAME_ACTION');
  }
  game.changed('state', true);
  await game.save();
  return game;
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

module.exports = { createInvite, acceptInvite, handleAction, endGame, startGlobalGame, updateGlobalGame, endGlobalGame, getActiveGlobalGame, normalizePinballEntries, rpsScore };
