const { StaffCall, TableSession, Table } = require('../models');
const AppError = require('../errors/AppError');

async function requireActiveSession(sessionId) {
  const session = await TableSession.findOne({ where: { id: sessionId, status: 'ACTIVE' } });
  if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found.');
  return session;
}

async function createCall(sessionId) {
  await requireActiveSession(sessionId);
  const [call] = await StaffCall.findOrCreate({
    where: { tableSessionId: sessionId, status: 'PENDING' },
    defaults: { tableSessionId: sessionId, status: 'PENDING' },
  });
  const session = await TableSession.findByPk(sessionId, {
    include: [{ model: Table, as: 'table', attributes: ['tableNumber'] }],
  });
  return {
    id: call.id,
    tableSessionId: sessionId,
    tableNumber: session?.table?.tableNumber ?? null,
    createdAt: call.createdAt,
  };
}

async function getMyStatus(sessionId) {
  const call = await StaffCall.findOne({ where: { tableSessionId: sessionId, status: 'PENDING' } });
  return { pending: !!call };
}

async function getPendingCalls() {
  const calls = await StaffCall.findAll({
    where: { status: 'PENDING' },
    include: [{
      model: TableSession,
      as: 'session',
      attributes: ['id'],
      include: [{ model: Table, as: 'table', attributes: ['tableNumber'] }],
    }],
    order: [['createdAt', 'ASC']],
  });
  return calls.map((call) => ({
    id: call.id,
    tableSessionId: call.tableSessionId,
    tableNumber: call.session?.table?.tableNumber ?? null,
    createdAt: call.createdAt,
  }));
}

async function resolveCall(id) {
  const call = await StaffCall.findByPk(id);
  if (!call) throw new AppError(404, 'STAFF_CALL_NOT_FOUND', 'Staff call not found.');
  await call.update({ status: 'RESOLVED', resolvedAt: new Date() });
  return call;
}

module.exports = { createCall, getMyStatus, getPendingCalls, resolveCall };
