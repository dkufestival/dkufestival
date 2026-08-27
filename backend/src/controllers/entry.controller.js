const entryService = require('../services/entry.service');

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
      io.to('participants').emit('participant:joined', {
        sessionId: result.session.id,
        participant: result.participant,
      });
      io.to(`session:${result.session.id}`).emit('table:updated', { sessionId: result.session.id });
    }
    res.status(result.restored ? 200 : 201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

module.exports = { getContext, enter };
