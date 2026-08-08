//관리자 컨트롤러
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../errors/AppError');
const tableService = require('../services/table.service');

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
    const session = await tableService.checkoutTable(req.params.tableId);
    res.json({ data: session });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  getTables,
  checkoutTable,
};
