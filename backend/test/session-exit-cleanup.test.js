const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const chatService = require('../src/services/chat.service');
const { ChatRoom } = require('../src/models');

async function withPatched(target, key, replacement, run) {
  const original = target[key];
  target[key] = replacement;
  try {
    return await run();
  } finally {
    target[key] = original;
  }
}

test('ending a session deletes its pending chat request records', async () => {
  const rooms = [{ id: 10, requesterSessionId: 1, targetSessionId: 2 }];
  let destroyedIds = [];
  await withPatched(ChatRoom, 'findAll', async () => rooms, async () => {
    await withPatched(ChatRoom, 'destroy', async ({ where }) => {
      destroyedIds = where.id[Object.getOwnPropertySymbols(where.id)[0]];
    }, async () => {
      const deleted = await chatService.cancelPendingForSession(1, { transaction: { LOCK: { UPDATE: 'UPDATE' } } });
      assert.deepEqual(deleted, rooms);
    });
  });
  assert.deepEqual(destroyedIds, [10]);
});

test('session cleanup resets received likes but preserves likes given to active sessions', () => {
  const tableService = fs.readFileSync(path.join(__dirname, '../src/services/table.service.js'), 'utf8');
  const lifecycleService = fs.readFileSync(path.join(__dirname, '../src/services/lifecycle.service.js'), 'utf8');
  const adminController = fs.readFileSync(path.join(__dirname, '../src/controllers/admin.controller.js'), 'utf8');
  assert.match(tableService, /TableLike\.destroy\(\{[\s\S]*where: \{ toSessionId: session\.id \}/);
  assert.match(lifecycleService, /TableLike\.destroy\(\{[\s\S]*where: \{ toSessionId: session\.id \}/);
  assert.doesNotMatch(tableService, /fromSessionId: session\.id/);
  assert.doesNotMatch(lifecycleService, /fromSessionId: session\.id/);
  assert.doesNotMatch(adminController, /TableLike\.destroy/);
});

test('background content polling is silent and stops after participant access ends', () => {
  const app = fs.readFileSync(path.join(__dirname, '../../frontend/js/app.js'), 'utf8');
  assert.match(app, /boardApi\.posts\([^\n]+\{ toast: false \}/);
  assert.match(app, /state\.liveContentTimer\) clearInterval\(state\.liveContentTimer\)/);
  assert.match(app, /state\.token = null/);
});
