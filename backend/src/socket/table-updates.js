function uniqueIds(ids = []) {
  return [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
}

function sessionTableId(session) {
  return session?.tableId || session?.table?.id || null;
}

function roomTableIds(room) {
  return [
    sessionTableId(room?.requesterSession),
    sessionTableId(room?.targetSession),
    sessionTableId(room?.sessionA),
    sessionTableId(room?.sessionB),
  ];
}

function emitPublicTableUpdate(io, { tableIds = [], reason = 'table:updated' } = {}) {
  if (!io) return;
  io.to('participants').to('monitors').to('admins').emit('table:updated', {
    tableIds: uniqueIds(tableIds),
    reason,
  });
}

module.exports = {
  emitPublicTableUpdate,
  roomTableIds,
  sessionTableId,
};
