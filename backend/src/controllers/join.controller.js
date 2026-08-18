// 합석 요청 컨트롤러
const joinService = require('../services/join.service');

async function createJoinRequest(req, res, next) {
  try {
    const data = await joinService.createJoinRequest(req.user.sessionId, req.body);
    const io = req.app.get('io');
    if (io) {
      io.to(`session:${req.user.sessionId}`).to(`session:${req.body.targetSessionId}`).emit('join:created', data.joinRequest);
      io.to(`session:${req.user.sessionId}`).to(`session:${req.body.targetSessionId}`).emit('chat:room-created', data.chatRoom);
    }
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
}

async function getJoinRequests(req, res, next) {
  try {
    const requests = await joinService.getJoinRequests(req.user.sessionId);
    res.json({ data: requests });
  } catch (error) {
    next(error);
  }
}

async function acceptJoinRequest(req, res, next) {
  try {
    const request = await joinService.acceptJoinRequest(req.params.requestId, req.user.sessionId);
    const io = req.app.get('io');
    if (io) io.to(`session:${request.fromSessionId}`).to(`session:${request.targetSessionId}`).emit('join:accepted', request);
    res.json({ data: request });
  } catch (error) {
    next(error);
  }
}

async function rejectJoinRequest(req, res, next) {
  try {
    const request = await joinService.rejectJoinRequest(req.params.requestId, req.user.sessionId);
    const io = req.app.get('io');
    if (io) io.to(`session:${request.fromSessionId}`).to(`session:${request.targetSessionId}`).emit('join:rejected', request);
    res.json({ data: request });
  } catch (error) {
    next(error);
  }
}

async function cancelJoinRequest(req, res, next) {
  try {
    const request = await joinService.cancelJoinRequest(req.params.requestId, req.user.sessionId);
    const io = req.app.get('io');
    if (io) io.to(`session:${request.fromSessionId}`).to(`session:${request.targetSessionId}`).emit('join:cancelled', request);
    res.json({ data: request });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createJoinRequest,
  getJoinRequests,
  acceptJoinRequest,
  rejectJoinRequest,
  cancelJoinRequest,
};
