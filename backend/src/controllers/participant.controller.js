const participantService = require('../services/participant.service');
const { emitPublicTableUpdate } = require('../socket/table-updates');

async function getMe(req, res, next) {
  try {
    res.json({ data: await participantService.getMe(req.user.participantId) });
  } catch (error) {
    next(error);
  }
}

async function updateMe(req, res, next) {
  try {
    const participant = await participantService.updateMe(req.user.participantId, req.body);
    const io = req.app.get('io');
    if (io) {
      io.to(`session:${req.user.sessionId}`).emit('participant:updated', { participant });
      emitPublicTableUpdate(io, { tableIds: [req.user.tableId], reason: 'participant:updated' });
    }
    res.json({ data: participant });
  } catch (error) {
    next(error);
  }
}

async function list(req, res, next) {
  try {
    res.json({ data: await participantService.list(req.user.sessionId) });
  } catch (error) {
    next(error);
  }
}

module.exports = { getMe, updateMe, list };
