const entryService = require('../services/entry.service');
const { emitPublicTableUpdate } = require('../socket/table-updates');

async function getContext(req, res, next) {
  try {
    res.json({ data: await entryService.getContext(req.query.qr) });
  } catch (error) {
    next(error);
  }
}

async function enter(req, res, next) {
  try {
    const result = await entryService.enter(req.body);
    const io = req.app.get('io');
    if (io) {
      io.to(`session:${result.session.id}`).emit('participant:joined', {
        sessionId: result.session.id,
        participant: result.participant,
      });
      emitPublicTableUpdate(io, {
        tableIds: [result.table.id],
        reason: result.restored ? 'entry:restored' : 'entry:joined',
      });
    }
    res.status(result.restored ? 200 : 201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

module.exports = { getContext, enter };
