const tableLikeService = require('../services/tableLike.service');
const { emitPublicTableUpdate } = require('../socket/table-updates');

async function toggle(req, res, next) {
  try {
    const result = await tableLikeService.toggleLike(req.user, req.params.tableId);
    const io = req.app.get('io');
    io?.to(`session:${result.toSessionId}`).emit('table:like-changed', result);
    emitPublicTableUpdate(io, { tableIds: [result.toTableId], reason: 'table:like-changed' });
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

async function list(req, res, next) {
  try {
    res.json({ data: await tableLikeService.getLikes(req.user) });
  } catch (error) {
    next(error);
  }
}

module.exports = { toggle, list };
