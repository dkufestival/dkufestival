const test = require('node:test');
const assert = require('node:assert/strict');
const { createSimulation } = require('../src/pinball/simulation');
const runtime = require('../src/services/pinball-runtime.service');
const service = require('../src/services/game.service');
const { GameSession } = require('../src/models');

test('server physics preserves fixed-step results across differently sized processing batches', () => {
  const a = createSimulation({ names: ['A*3', 'B'], seed: 12345 });
  const b = createSimulation({ names: ['A*3', 'B'], seed: 12345 });
  for (let step = 0; step < 18000; step++) a.advance();
  for (let batch = 0; batch < 300; batch++) for (let step = 0; step < 60; step++) b.advance();
  assert.deepEqual(a.snapshot(), b.snapshot());
  assert.ok(a.done);
  assert.equal(a.snapshot().result.finishOrder.length + a.snapshot().result.eliminatedOrder.length, 4);
  a.snapshot().balls.forEach(ball => ['x', 'y', 'vx', 'vy'].forEach(key => assert.ok(Number.isFinite(ball[key]))));
});

test('duplicate starts, final persistence, restart interruption and admin end use one locked state', async t => {
  const game = { id: 987, type: 'PINBALL', mode: 'GLOBAL', status: 'ACTIVE', state: { lifecyclePhase: 'ANNOUNCED', names: ['A', 'B'], seed: 12 },
    changed() {}, async save() { writes++; } };
  let writes = 0;
  let queue = Promise.resolve();
  t.mock.method(GameSession, 'findOne', async () => game);
  t.mock.method(GameSession, 'findByPk', async () => game);
  t.mock.method(GameSession, 'findAll', async () => [game]);
  t.mock.method(GameSession.sequelize, 'query', async () => [{ acquired: 1 }]);
  t.mock.method(GameSession.sequelize, 'transaction', work => {
    const result = queue.then(async () => {
      const callbacks = [];
      const result = await work({ LOCK: { UPDATE: 'UPDATE' }, afterCommit: callback => callbacks.push(callback) });
      callbacks.forEach(callback => callback());
      return result;
    });
    queue = result.catch(() => {});
    return result;
  });
  t.after(() => runtime.stop(game.id));
  const attempts = await Promise.allSettled([
    service.updateGlobalGame({ gameId: game.id, action: 'START' }),
    service.updateGlobalGame({ gameId: game.id, action: 'START' }),
  ]);
  assert.equal(attempts.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(writes, 1);
  const initial = runtime.current(game);
  assert.equal(initial.step, 0);
  assert.equal(runtime.start(game).snapshot, initial);
  const result = { ...initial, seq: 42, status: 'finished', finishedAt: new Date().toISOString() };
  await Promise.all([service.persistPinballSnapshot(game.id, result), service.persistPinballSnapshot(game.id, result)]);
  assert.equal(writes, 2);
  assert.deepEqual(game.state.pinballSnapshot, result);
  await service.endGlobalGame({ gameId: game.id, state: { pinballSnapshot: { result: 'forged' } } });
  assert.equal(game.status, 'ENDED');
  assert.deepEqual(game.state.pinballSnapshot, result);
  assert.equal(runtime.current({ id: game.id }), null);
  game.status = 'ACTIVE';
  delete game.state.pinballSnapshot;
  await service.recoverPinballGames();
  assert.equal(game.state.pinballSnapshot.status, 'cancelled');
  assert.equal(game.state.pinballSnapshot.reason, 'server-restarted');
  assert.ok(game.state.pinballSnapshot.seq > result.seq);
  const savedWrites = writes;
  await service.recoverPinballGames();
  assert.equal(writes, savedWrites);
  await assert.rejects(service.handleAction(1, { gameId: game.id, state: { result: 'forged' } }), /서버에서만/);
});
