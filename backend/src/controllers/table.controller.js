// 테이블 컨트롤러
const tableService = require('../services/table.service');

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
    res.status(201).json({ data: session });
  } catch (error) {
    next(error);
  }
}

async function updateMyTable(req, res, next) {
  try {
    const session = await tableService.updateMyTable(req.user.sessionId, req.body);
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
};
