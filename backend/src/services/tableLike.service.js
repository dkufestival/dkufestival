const { TableLike, TableSession, Table, Participant } = require('../models');
const AppError = require('../errors/AppError');

async function requireHostSession(user) {
  const participant = await Participant.findByPk(user.participantId);
  if (!participant || !participant.isHost) {
    throw new AppError(403, 'HOST_REQUIRED', 'Only the table host can like a table.');
  }
  const session = await TableSession.findOne({ where: { id: user.sessionId, status: 'ACTIVE' } });
  if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found.');
  return session;
}

async function toggleLike(user, targetTableId) {
  const mySession = await requireHostSession(user);
  const targetSession = await TableSession.findOne({ where: { tableId: targetTableId, status: 'ACTIVE' } });
  if (!targetSession) throw new AppError(404, 'TARGET_SESSION_NOT_FOUND', 'Target table has no active session.');
  if (targetSession.id === mySession.id) throw new AppError(400, 'INVALID_LIKE_TARGET', 'Cannot like your own table.');

  const myTable = await Table.findByPk(mySession.tableId, { attributes: ['tableNumber'] });
  const existing = await TableLike.findOne({
    where: { fromSessionId: mySession.id, toSessionId: targetSession.id },
  });
  if (existing) {
    await existing.destroy();
    return { liked: false, toSessionId: targetSession.id, toTableId: targetSession.tableId, fromTableNumber: myTable?.tableNumber ?? null };
  }
  await TableLike.create({ fromSessionId: mySession.id, toSessionId: targetSession.id });
  return { liked: true, toSessionId: targetSession.id, toTableId: targetSession.tableId, fromTableNumber: myTable?.tableNumber ?? null };
}

async function getLikes(user) {
  const mySessionId = Number(user.sessionId);
  const [given, received] = await Promise.all([
    TableLike.findAll({
      where: { fromSessionId: mySessionId },
      include: [{
        model: TableSession,
        as: 'toSession',
        attributes: ['id'],
        include: [{ model: Table, as: 'table', attributes: ['tableNumber'] }],
      }],
    }),
    TableLike.findAll({
      where: { toSessionId: mySessionId },
      include: [{
        model: TableSession,
        as: 'fromSession',
        attributes: ['id'],
        include: [{ model: Table, as: 'table', attributes: ['tableNumber'] }],
      }],
      order: [['createdAt', 'DESC']],
    }),
  ]);

  return {
    given: given.map((like) => ({
      toSessionId: like.toSessionId,
      toTableNumber: like.toSession?.table?.tableNumber ?? null,
    })),
    received: received.map((like) => ({
      fromSessionId: like.fromSessionId,
      fromTableNumber: like.fromSession?.table?.tableNumber ?? null,
      createdAt: like.createdAt,
    })),
  };
}

module.exports = { toggleLike, getLikes };
