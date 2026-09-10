const test = require('node:test');
const assert = require('node:assert/strict');
const monitorController = require('../src/controllers/public-monitor.controller');
const tableService = require('../src/services/table.service');
const { monitorRateLimit, hits, MAX_REQUESTS } = require('../src/middleware/monitor-rate-limit');

test('public monitor serializes only table status fields and disables caching', async () => {
  const original = tableService.getTables;
  tableService.getTables = async () => [{ id: 9, tableNumber: 1, qrToken: 'secret', qrEnabled: true, activeSession: { id: 8, startedAt: 'start', expiresAt: 'end', maleCount: 2, femaleCount: 3, participants: [{ nickname: 'private' }] } }, { tableNumber: 2, activeSession: null }];
  const response = { headers: {}, set(name, value) { this.headers[name] = value; return this; }, json(body) { this.body = body; return this; } };
  try { await monitorController.getTables({}, response, assert.fail); } finally { tableService.getTables = original; }
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.deepEqual(response.body, { data: [{ tableNumber: 1, activeSession: { startedAt: 'start', expiresAt: 'end', maleCount: 2, femaleCount: 3, totalCount: 5 } }, { tableNumber: 2, activeSession: null }] });
});

test('public monitor limits an address after 60 requests', () => {
  hits.clear(); const req = { ip: '198.51.100.1' }; let calls = 0; const next = () => { calls += 1; }; const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  for (let index = 0; index < MAX_REQUESTS; index += 1) monitorRateLimit(req, res, next);
  monitorRateLimit(req, res, next);
  assert.equal(calls, MAX_REQUESTS); assert.equal(res.code, 429); assert.equal(res.body.error.code, 'RATE_LIMITED'); hits.clear();
});
