const tableService = require('../services/table.service');

function publicTable(table) {
  const session = table.activeSession;
  if (!session) return { tableNumber: table.tableNumber, activeSession: null };
  const maleCount = Number(session.maleCount) || 0;
  const femaleCount = Number(session.femaleCount) || 0;
  return { tableNumber: table.tableNumber, activeSession: {
    startedAt: session.startedAt, expiresAt: session.expiresAt, maleCount, femaleCount, totalCount: maleCount + femaleCount,
  } };
}

async function getTables(req, res, next) {
  try {
    const tables = await tableService.getTables();
    res.set('Cache-Control', 'no-store').json({ data: tables.map(publicTable) });
  } catch (error) { next(error); }
}

module.exports = { getTables, publicTable };
