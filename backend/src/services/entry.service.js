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
    include: [{ model: Participant, as: 'participants' }],
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
  if (!data.qrToken || !data.clientId || !data.nickname) {
    throw new AppError(400, 'INVALID_ENTRY', 'qrToken, clientId and nickname are required.');
  }

  await lifecycleService.expireSessions();
  return sequelize.transaction(async (transaction) => {
    const table = await findTableByQr(data.qrToken, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    let session = await getActiveSession(table.id, transaction);
    const isFirstEntry = !session;
    if (isFirstEntry) {
      const counts = validateCounts(data, true);
      const startedAt = new Date();
      session = await TableSession.create({
        tableId: table.id,
        maleCount: counts.maleCount,
        femaleCount: counts.femaleCount,
        startedAt,
        expiresAt: defaultExpiresAt(startedAt),
        status: 'ACTIVE',
      }, { transaction });
    }

    const [participant, created] = await Participant.findOrCreate({
      where: { tableSessionId: session.id, clientId: data.clientId },
      defaults: {
        nickname: data.nickname.trim(),
        isHost: isFirstEntry,
      },
      transaction,
    });

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
