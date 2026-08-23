// 테이블 비즈니스 로직
const { Op } = require('sequelize');
const sequelize = require('../config/db');
const { Table, TableSession, Participant } = require('../models');
const AppError = require('../errors/AppError');
const { defaultExpiresAt } = require('./session.service');
const lifecycleService = require('./lifecycle.service');

async function getTables(options = {}) {
  await lifecycleService.expireSessions();
  const tables = await Table.findAll({
    attributes: options.includeQrToken ? undefined : { exclude: ['qrToken'] },
    include: [{
      model: TableSession,
      as: 'sessions',
      where: { status: 'ACTIVE', expiresAt: { [Op.gt]: new Date() } },
      required: false,
      include: [{ model: Participant, as: 'participants' }],
    }],
    order: [['tableNumber', 'ASC']],
  });
  return tables.map((table) => {
    const json = table.toJSON();
    const activeSession = json.sessions?.[0] || null;
    delete json.sessions;
    if (!options.includeQrToken) delete json.qrToken;
    return { ...json, activeSession };
  });
}

async function getTable(tableId) {
  return Table.findByPk(tableId, {
    attributes: { exclude: ['qrToken'] },
    include: [{ model: TableSession, as: 'sessions', where: { status: 'ACTIVE' }, required: false, include: [{ model: Participant, as: 'participants' }] }],
  });
}

async function enterTable(tableId, data) {
  const table = await Table.findByPk(tableId);
  if (!table || table.qrToken !== data.qrToken) {
    throw new AppError(404, 'INVALID_TABLE_TOKEN', '좌석 또는 QR 토큰이 올바르지 않습니다.');
  }

  const activeSession = await TableSession.findOne({ where: { tableId, status: 'ACTIVE' } });
  if (activeSession) throw new AppError(409, 'TABLE_ALREADY_ACTIVE', '이미 사용 중인 좌석입니다.');

  return TableSession.create({
    tableId,
    nickname: data.nickname,
    memberCount: data.memberCount,
    genderType: data.genderType,
    maleCount: data.genderType === 'FEMALE' ? 0 : data.memberCount,
    femaleCount: data.genderType === 'MALE' ? 0 : data.memberCount,
    status: 'ACTIVE',
    startedAt: new Date(),
    expiresAt: defaultExpiresAt(new Date()),
  });
}

async function updateMyTable(sessionId, data) {
  const session = await TableSession.findByPk(sessionId);
  if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', '좌석 세션을 찾을 수 없습니다.');

  return session.update(data);
}

async function updateMyCounts(user, data) {
  const participant = await Participant.findByPk(user.participantId);
  if (!participant || !participant.isHost) throw new AppError(403, 'HOST_REQUIRED', 'Only the table host can update counts.');
  const maleCount = Number(data.maleCount);
  const femaleCount = Number(data.femaleCount);
  if (maleCount < 0 || femaleCount < 0 || maleCount + femaleCount < 1) {
    throw new AppError(400, 'INVALID_COUNTS', 'Counts must include at least one person.');
  }
  const session = await TableSession.findOne({ where: { id: user.sessionId, status: 'ACTIVE' } });
  if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found.');
  return session.update({ maleCount, femaleCount });
}

async function checkoutTable(tableId) {
  return sequelize.transaction(async (transaction) => {
    const session = await TableSession.findOne({
      where: { tableId, status: 'ACTIVE' },
      order: [['startedAt', 'DESC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!session) {
      return null;
    }

    await session.update({
      status: 'CLOSED',
      endedAt: new Date(),
    }, { transaction });
    const chats = await lifecycleService.closeSessionChats(session.id, 'SESSION_CHECKED_OUT', { transaction });
    return { session, ...chats };
  });
}

async function adminCheckin(tableId, data) {
  const table = await Table.findByPk(tableId);
  if (!table) throw new AppError(404, 'TABLE_NOT_FOUND', 'Table not found.');
  const existing = await TableSession.findOne({ where: { tableId, status: 'ACTIVE' } });
  if (existing) throw new AppError(409, 'TABLE_ALREADY_ACTIVE', 'Table already has active session.');
  const startedAt = new Date();
  return TableSession.create({
    tableId,
    maleCount: Number(data.maleCount || 0),
    femaleCount: Number(data.femaleCount || 0),
    startedAt,
    expiresAt: defaultExpiresAt(startedAt),
    status: 'ACTIVE',
  });
}

async function activeSessionForAdmin(tableId) {
  const session = await TableSession.findOne({ where: { tableId, status: 'ACTIVE' } });
  if (!session) throw new AppError(404, 'ACTIVE_SESSION_NOT_FOUND', 'Active table session not found.');
  return session;
}

async function extendTable(tableId, minutes) {
  const session = await activeSessionForAdmin(tableId);
  const base = new Date(session.expiresAt) > new Date() ? new Date(session.expiresAt) : new Date();
  return session.update({ expiresAt: new Date(base.getTime() + Number(minutes) * 60 * 1000) });
}

async function resetTime(tableId) {
  const session = await activeSessionForAdmin(tableId);
  return session.update({ expiresAt: defaultExpiresAt(new Date()) });
}

async function updateCounts(tableId, data) {
  const session = await activeSessionForAdmin(tableId);
  return session.update({ maleCount: Number(data.maleCount), femaleCount: Number(data.femaleCount) });
}

async function regenerateQr(tableId, token) {
  const table = await Table.findByPk(tableId);
  if (!table) throw new AppError(404, 'TABLE_NOT_FOUND', 'Table not found.');
  return table.update({ qrToken: token, qrVersion: table.qrVersion + 1 });
}

async function setQrEnabled(tableId, qrEnabled) {
  const table = await Table.findByPk(tableId);
  if (!table) throw new AppError(404, 'TABLE_NOT_FOUND', 'Table not found.');
  return table.update({ qrEnabled });
}

module.exports = {
  getTables,
  getTable,
  enterTable,
  updateMyTable,
  updateMyCounts,
  checkoutTable,
  adminCheckin,
  extendTable,
  resetTime,
  updateCounts,
  regenerateQr,
  setQrEnabled,
};
