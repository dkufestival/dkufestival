// 테이블 컨트롤러
const tableService = require('../services/table.service');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

async function getTables(req, res, next) {
  try {
    const tables = await tableService.getTables();
    res.json({ data: tables });
  } catch (error) {
    next(error);
  }
}

async function getTable(req, res, next) {
  try {
    const table = await tableService.getTable(req.params.tableId);
    res.json({ data: table });
  } catch (error) {
    next(error);
  }
}

async function enterTable(req, res, next) {
  try {
    const session = await tableService.enterTable(req.params.tableId, req.body);
    const token = jwt.sign({ role: 'PARTICIPANT', sessionId: session.id }, env.jwtSecret, {
      expiresIn: '12h',
    });
    res.status(201).json({ data: { session, token } });
  } catch (error) {
    next(error);
  }
}

async function updateMyTable(req, res, next) {
  try {
    const session = req.user.participantId
      ? await tableService.updateMyCounts(req.user, req.body)
      : await tableService.updateMyTable(req.user.sessionId, req.body);
    const io = req.app.get('io');
    if (io) io.to(`session:${session.id}`).emit('table:updated', { session });
    res.json({ data: session });
  } catch (error) {
    next(error);
  }
}

async function updateMyAccepting(req, res, next) {
  try {
    const session = await tableService.updateMyAccepting(req.user, req.body.acceptingRequests);
    const io = req.app.get('io');
    if (io) io.to('participants').emit('table:updated', { session });
    res.json({ data: session });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getTables,
  getTable,
  enterTable,
  updateMyTable,
  updateMyAccepting,
};
