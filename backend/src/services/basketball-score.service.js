const { Op } = require('sequelize');
const { BasketballScore } = require('../models');
const AppError = require('../errors/AppError');

function createServiceError(message, code, status = 400) {
  return new AppError(status, code, message);
}

function normalizeScore(value) {
  const score = Number(value);
  if (!Number.isInteger(score) || score < 1 || score > 10000) {
    throw createServiceError('농구 점수는 1~10000 사이의 정수여야 합니다.', 'INVALID_BASKETBALL_SCORE');
  }
  return score;
}

async function submitBestScore({ participantId, tableSessionId, score: rawScore }) {
  const score = normalizeScore(rawScore);

  const achievedAt = new Date();
  const [record, created] = await BasketballScore.findOrCreate({
    where: { participantId: Number(participantId), tableSessionId: Number(tableSessionId) },
    defaults: {
      tableSessionId: Number(tableSessionId),
      bestScore: score,
      achievedAt,
    },
  });
  if (created) return { improved: true, personalBest: score, record };

  const [updatedCount] = await BasketballScore.update({
    bestScore: score,
    tableSessionId: Number(tableSessionId),
    achievedAt,
  }, {
    where: {
      participantId: Number(participantId),
      tableSessionId: Number(tableSessionId),
      bestScore: { [Op.lt]: score },
    },
  });

  if (!updatedCount) {
    const latest = await BasketballScore.findOne({ where: { participantId: Number(participantId), tableSessionId: Number(tableSessionId) } });
    return { improved: false, personalBest: Number(latest.bestScore), record: latest };
  }
  const updated = await BasketballScore.findOne({ where: { participantId: Number(participantId), tableSessionId: Number(tableSessionId) } });
  return { improved: true, personalBest: Number(updated.bestScore), record: updated };
}

async function getPersonalBest(participantId, tableSessionId) {
  if (!participantId || !tableSessionId) return 0;
  const record = await BasketballScore.findOne({ where: { participantId: Number(participantId), tableSessionId: Number(tableSessionId) } });
  return Number(record?.bestScore || 0);
}

async function getLeaderboard() {
  const records = await BasketballScore.findAll({
    include: [
      { association: 'participant', attributes: ['id', 'nickname'], required: true },
      {
        association: 'tableSession',
        attributes: ['id'],
        required: true,
        include: [{ association: 'table', attributes: ['tableNumber'], required: true }],
      },
    ],
    order: [['bestScore', 'DESC'], ['achievedAt', 'ASC'], ['id', 'ASC']],
    limit: 3,
  });

  return records.map((record, index) => ({
    rank: index + 1,
    participantId: record.participantId,
    nickname: record.participant?.nickname || '참가자',
    tableNumber: record.tableSession?.table?.tableNumber ?? null,
    score: Number(record.bestScore),
    achievedAt: record.achievedAt,
  }));
}

async function getState(participantId, tableSessionId) {
  return {
    freePlay: true,
    personalBest: await getPersonalBest(participantId, tableSessionId),
  };
}

module.exports = {
  getLeaderboard,
  getPersonalBest,
  getState,
  normalizeScore,
  submitBestScore,
};
