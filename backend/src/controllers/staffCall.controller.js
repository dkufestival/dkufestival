const staffCallService = require('../services/staffCall.service');

async function create(req, res, next) {
  try {
    const call = await staffCallService.createCall(req.user.sessionId);
    req.app.get('io')?.to('admins').emit('staffCall:created', call);
    res.status(201).json({ data: call });
  } catch (error) {
    next(error);
  }
}

async function cancel(req, res, next) {
  try {
    const call = await staffCallService.cancelCall(req.user.sessionId);
    const io = req.app.get('io');
    io?.to('admins').emit('staffCall:resolved', { id: call.id });
    res.json({ data: { id: call.id } });
  } catch (error) {
    next(error);
  }
}

async function myStatus(req, res, next) {
  try {
    res.json({ data: await staffCallService.getMyStatus(req.user.sessionId) });
  } catch (error) {
    next(error);
  }
}

async function adminList(req, res, next) {
  try {
    res.json({ data: await staffCallService.getPendingCalls() });
  } catch (error) {
    next(error);
  }
}

async function adminResolve(req, res, next) {
  try {
    const call = await staffCallService.resolveCall(req.params.id);
    const io = req.app.get('io');
    io?.to('admins').emit('staffCall:resolved', { id: call.id });
    io?.to(`session:${call.tableSessionId}`).emit('staffCall:resolved', { id: call.id });
    res.json({ data: { id: call.id } });
  } catch (error) {
    next(error);
  }
}

module.exports = { create, cancel, myStatus, adminList, adminResolve };
