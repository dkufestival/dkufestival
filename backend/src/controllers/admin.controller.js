//관리자 컨트롤러
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');
const AppError = require('../errors/AppError');
const tableService = require('../services/table.service');
const lifecycleService = require('../services/lifecycle.service');

async function login(req, res, next) {
  try {
    if (!env.admin.password) {
      throw new AppError(503, 'ADMIN_NOT_CONFIGURED', 'ADMIN_PASSWORD 환경변수를 먼저 설정해야 합니다.');
    }
    if (req.body.id !== env.admin.id || req.body.password !== env.admin.password) {
      throw new AppError(401, 'INVALID_ADMIN_CREDENTIALS', '관리자 로그인 정보가 올바르지 않습니다.');
    }

    const token = jwt.sign({ role: 'ADMIN' }, env.jwtSecret, {
      expiresIn: '1d',
    });

    res.json({ data: { token } });
  } catch (error) {
    next(error);
  }
}

async function getTables(req, res, next) {
  try {
    const tables = await tableService.getTables({ includeQrToken: true });
    res.json({ data: tables });
  } catch (error) {
    next(error);
  }
}

async function checkoutTable(req, res, next) {
  try {
    const result = await tableService.checkoutTable(req.params.tableId);
    const io = req.app.get('io');
    if (io && result) lifecycleService.emitLifecycle(io, result);
    res.json({ data: result?.session || null });
  } catch (error) {
    next(error);
  }
}

async function checkin(req, res, next) {
  try {
    const session = await tableService.adminCheckin(req.params.tableId, req.body);
    const io = req.app.get('io');
    if (io) io.emit('table:updated', { session });
    res.status(201).json({ data: session });
  } catch (error) {
    next(error);
  }
}

async function extend(req, res, next) {
  try {
    const session = await tableService.extendTable(req.params.tableId, req.body.minutes);
    const io = req.app.get('io');
    if (io) io.to(`session:${session.id}`).emit('table:extended', { session, paymentReference: req.body.paymentReference || null });
    res.json({ data: session });
  } catch (error) {
    next(error);
  }
}

async function resetTime(req, res, next) {
  try {
    const session = await tableService.resetTime(req.params.tableId);
    const io = req.app.get('io');
    if (io) io.to(`session:${session.id}`).emit('table:extended', { session });
    res.json({ data: session });
  } catch (error) {
    next(error);
  }
}

async function counts(req, res, next) {
  try {
    const session = await tableService.updateCounts(req.params.tableId, req.body);
    const io = req.app.get('io');
    if (io) io.to(`session:${session.id}`).emit('table:updated', { session });
    res.json({ data: session });
  } catch (error) {
    next(error);
  }
}

async function regenerateQr(req, res, next) {
  try {
    const table = await tableService.regenerateQr(req.params.tableId, crypto.randomBytes(32).toString('base64url'));
    res.json({ data: table });
  } catch (error) {
    next(error);
  }
}

async function enableQr(req, res, next) {
  try {
    res.json({ data: await tableService.setQrEnabled(req.params.tableId, true) });
  } catch (error) {
    next(error);
  }
}

async function disableQr(req, res, next) {
  try {
    res.json({ data: await tableService.setQrEnabled(req.params.tableId, false) });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  getTables,
  checkoutTable,
  checkin,
  extend,
  resetTime,
  counts,
  regenerateQr,
  enableQr,
  disableQr,
};
