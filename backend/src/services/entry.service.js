const { Op } = require('sequelize');
const sequelize = require('../config/db');
const { Table, TableSession, Participant } = require('../models');
const AppError = require('../errors/AppError');
const { defaultExpiresAt, isActiveSession } = require('./session.service');
const { signParticipantToken } = require('./token.service');
const lifecycleService = require('./lifecycle.service');

function validateCounts(data, required) {
  const maleCount = Number(data.maleCount ?? 0);
  const femaleCount = Number(data.femaleCount ?? 0);
  if (required && maleCount + femaleCount < 1) {
    throw new AppError(400, 'INVALID_COUNTS', 'maleCount and femaleCount must include at least one person.');
  }
  if (maleCount < 0 || femaleCount < 0) {
    throw new AppError(400, 'INVALID_COUNTS', 'Counts cannot be negative.');
  }
  return { maleCount, femaleCount };
}

function validateGender(value) {
  if (!['MALE', 'FEMALE'].includes(value)) throw new AppError(400, 'INVALID_GENDER', 'gender must be MALE or FEMALE.');
  return value;
}

async function findTableByQr(qrToken, options = {}) {
  const table = await Table.findOne({ where: { qrToken }, ...options });
  if (!table || !table.qrEnabled) {
    throw new AppError(404, 'INVALID_QR', 'Invalid or disabled QR token.');
  }
  return table;
}

async function getActiveSession(tableId, transaction) {
  return TableSession.findOne({
    where: {
      tableId,
      status: 'ACTIVE',
      expiresAt: { [Op.gt]: new Date() },
    },
    include: [{ model: Participant, as: 'participants', where: { kickedAt: null, blockedAt: null }, required: false }],
    order: [['startedAt', 'DESC']],
    transaction,
  });
}

function summarizeSession(session) {
  if (!session) return null;
  return {
    id: session.id,
    maleCount: session.maleCount,
    femaleCount: session.femaleCount,
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
    participants: session.participants || [],
  };
}

async function getContext(qrToken) {
  if (!qrToken) throw new AppError(400, 'QR_REQUIRED', 'qr query parameter is required.');
  await lifecycleService.expireSessions();
  const table = await findTableByQr(qrToken);
  const session = await getActiveSession(table.id);
  return {
    tableId: table.id,
    tableNumber: table.tableNumber,
    hasActiveSession: Boolean(session),
    requiresTeamSetup: !session,
    session: summarizeSession(session),
  };
}

async function enter(data) {
  if (!data.qrToken || !data.clientId || !data.nickname || !data.gender) {
    throw new AppError(400, 'INVALID_ENTRY', 'qrToken, clientId, nickname and gender are required.');
  }
  const gender = validateGender(data.gender);

  await lifecycleService.expireSessions();
  return sequelize.transaction(async (transaction) => {
    const table = await findTableByQr(data.qrToken, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const blockedParticipant = await Participant.findOne({
      where: { clientId: data.clientId, blockedAt: { [Op.ne]: null } },
      include: [{ model: TableSession, as: 'session', required: true, where: { tableId: table.id }, attributes: [] }],
      transaction,
    });
    if (blockedParticipant) {
      throw new AppError(403, 'PARTICIPANT_BLOCKED', '관리자에 의해 재접속이 차단된 사용자입니다. 직원에게 문의해 주세요.');
    }

    let session = await getActiveSession(table.id, transaction);
    const isFirstEntry = !session;
    if (isFirstEntry) {
      const startedAt = new Date();
      session = await TableSession.create({
        tableId: table.id,
        maleCount: 0,
        femaleCount: 0,
        startedAt,
        expiresAt: defaultExpiresAt(startedAt),
        status: 'ACTIVE',
      }, { transaction });
    }

    const [participant, created] = await Participant.findOrCreate({
      where: { tableSessionId: session.id, clientId: data.clientId },
      defaults: {
        nickname: data.nickname.trim(),
        gender,
        isHost: isFirstEntry,
      },
      transaction,
    });

    // 강제 퇴장은 기존 로그인만 종료한다. 사용자가 다시 입장하면 즉시 새 토큰을 발급한다.
    const wasKicked = Boolean(participant.kickedAt);
    if (wasKicked) {
      await participant.update({ kickedAt: null, kickedReason: null }, { transaction });
      const activeHost = await Participant.findOne({
        where: { tableSessionId: session.id, isHost: true, kickedAt: null, blockedAt: null },
        transaction,
      });
      if (!activeHost) await participant.update({ isHost: true }, { transaction });
    }

    const previousGender = participant.gender;
    if (previousGender !== gender) {
      const delta = { maleCount: 0, femaleCount: 0 };
      if (previousGender === 'MALE') delta.maleCount -= 1;
      if (previousGender === 'FEMALE') delta.femaleCount -= 1;
      if (gender === 'MALE') delta.maleCount += 1;
      if (gender === 'FEMALE') delta.femaleCount += 1;
      await participant.update({ gender }, { transaction });
      await session.increment(delta, { transaction });
    }
    if (created && previousGender === gender) {
      await session.increment(gender === 'MALE' ? { maleCount: 1 } : { femaleCount: 1 }, { transaction });
    }
    if (wasKicked && previousGender === gender) {
      await session.increment(gender === 'MALE' ? { maleCount: 1 } : { femaleCount: 1 }, { transaction });
    }
    await session.reload({ transaction });

    if (!created && data.nickname && participant.nickname !== data.nickname.trim()) {
      await participant.update({ nickname: data.nickname.trim() }, { transaction });
    }

    const token = signParticipantToken({
      tableId: table.id,
      sessionId: session.id,
      participantId: participant.id,
    });

    return {
      table: { id: table.id, tableNumber: table.tableNumber },
      session,
      participant,
      token,
      restored: !created,
    };
  });
}

module.exports = { getContext, enter, summarizeSession, getActiveSession };
