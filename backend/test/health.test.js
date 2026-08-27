const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');

test('GET /health returns an ok response', () => {
  const healthRoute = app.router.stack.find((layer) => layer.route?.path === '/health');
  assert.ok(healthRoute, 'health route must be registered');

  let responseBody;
  healthRoute.route.stack[0].handle({}, { json(body) { responseBody = body; } });
  assert.deepEqual(responseBody, { status: 'ok' });
});
