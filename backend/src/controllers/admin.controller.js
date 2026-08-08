//관리자 컨트롤러
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const tableService = require('../services/table.service');

async function login(req, res, next) {
  try {
    // TODO: 실제 관리자 계정 검증으로 교체한다.
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
    const tables = await tableService.getTables();
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
