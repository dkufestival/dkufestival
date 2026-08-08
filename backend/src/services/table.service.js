// 테이블 비즈니스 로직
const { Table, TableSession } = require('../models');
const AppError = require('../errors/AppError');

async function getTables(options = {}) {
  return Table.findAll({
    attributes: options.includeQrToken ? undefined : { exclude: ['qrToken'] },
    include: [{ model: TableSession, as: 'sessions', where: { status: 'ACTIVE' }, required: false }],
  });
}

async function getTable(tableId) {
  return Table.findByPk(tableId, {
    attributes: { exclude: ['qrToken'] },
    include: [{ model: TableSession, as: 'sessions', where: { status: 'ACTIVE' }, required: false }],
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
    status: 'ACTIVE',
    startedAt: new Date(),
  });
}

async function updateMyTable(sessionId, data) {
  const session = await TableSession.findByPk(sessionId);
  if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', '좌석 세션을 찾을 수 없습니다.');

  return session.update(data);
}

async function checkoutTable(tableId) {
  const session = await TableSession.findOne({
    where: { tableId, status: 'ACTIVE' },
    order: [['startedAt', 'DESC']],
  });

  if (!session) {
    return null;
  }

  return session.update({
    status: 'CLOSED',
    endedAt: new Date(),
  });
}

module.exports = {
  getTables,
  getTable,
  enterTable,
  updateMyTable,
  checkoutTable,
};
