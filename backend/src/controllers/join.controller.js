// 합석 요청 컨트롤러
const joinService = require('../services/join.service');

async function createJoinRequest(req, res, next) {
  try {
    const request = await joinService.createJoinRequest(req.user.sessionId, req.body);
    res.status(201).json({ data: request });
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
    res.json({ data: request });
  } catch (error) {
    next(error);
  }
}

async function rejectJoinRequest(req, res, next) {
  try {
    const request = await joinService.rejectJoinRequest(req.params.requestId, req.user.sessionId);
    res.json({ data: request });
  } catch (error) {
    next(error);
  }
}

async function cancelJoinRequest(req, res, next) {
  try {
    await joinService.cancelJoinRequest(req.params.requestId, req.user.sessionId);
    res.status(204).send();
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
