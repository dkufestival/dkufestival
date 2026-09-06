const { performance } = require('node:perf_hooks');
const { createSimulation, STEP } = require('../pinball/simulation');

// This application runs one Node/Socket.IO process. No viewer owns a simulation.
const runtimes = new Map();
let io;
let persist;
const room = id => `pinball:${id}`;
function configure(options) { io = options.io; persist = options.persist; }
function publish(snapshot) {
  io?.to(room(snapshot.gameId)).emit('pinball:snapshot', snapshot);
}
function start(game) {
  const id = Number(game.id);
  if (runtimes.has(id)) return runtimes.get(id);
  const simulation = createSimulation(game.state);
  const runtime = { simulation, seq: 0, snapshot: null, timer: null, saving: false, saved: false, retryAt: 0 };
  runtimes.set(id, runtime);
  const origin = performance.now() + Math.max(0, Number(game.state.startAt) - Date.now());
  function capture(status) {
    runtime.snapshot = { gameId: id, seq: ++runtime.seq, serverTime: Date.now(), status, ...simulation.snapshot(),
      ...(status === 'finished' ? { finishedAt: new Date().toISOString() } : {}) };
    publish(runtime.snapshot);
  }
  async function saveFinal() {
    if (runtime.saving || runtime.saved || !persist || performance.now() < runtime.retryAt) return;
    runtime.saving = true;
    try {
      await persist(id, runtime.snapshot);
      runtime.saved = true;
      clearInterval(runtime.timer);
      if (runtimes.get(id) !== runtime) return;
      io?.to(room(id)).emit('pinball:end', runtime.snapshot);
      console.info(`[PINBALL] game finished gameId=${id} winner=${JSON.stringify(runtime.snapshot.result.winner?.name ?? null)}`);
    } catch (error) {
      runtime.retryAt = performance.now() + 5000;
      console.warn(`[PINBALL] result save failed gameId=${id}: ${error.message}`);
    } finally { runtime.saving = false; }
  }
  runtime.tick = () => {
    if (runtime.snapshot?.status === 'finished') { void saveFinal(); return; }
    const elapsed = performance.now() - origin;
    // Bound work per tick if the server is overloaded; never skip physics steps.
    const target = Math.max(0, Math.floor(elapsed / (STEP * 1000)));
    let count = 0;
    while (simulation.step < target && !simulation.done && count++ < 240) simulation.advance();
    capture(simulation.done ? 'finished' : elapsed < 0 ? 'waiting' : 'running');
    if (simulation.done) void saveFinal();
  };
  capture('waiting');
  runtime.timer = setInterval(runtime.tick, 50);
  runtime.timer.unref?.();
  console.info(`[PINBALL] simulation started gameId=${id}`);
  return runtime;
}
function current(game) {
  const snapshot = runtimes.get(Number(game.id))?.snapshot || game.state?.pinballSnapshot;
  if (snapshot) return snapshot;
  if (game.state?.lifecyclePhase === 'ANNOUNCED') {
    return { gameId: Number(game.id), seq: 0, serverTime: Date.now(), status: 'waiting', ...createSimulation(game.state).snapshot() };
  }
  return null;
}
function stop(id) {
  const runtime = runtimes.get(Number(id));
  if (!runtime) return;
  clearInterval(runtime.timer);
  runtimes.delete(Number(id));
}
function cancelled(game, reason = 'admin') {
  const prior = current(game);
  return { ...(prior || { ...createSimulation(game.state).snapshot(), gameId: Number(game.id) }),
    seq: prior ? prior.seq + 1 : Number.MAX_SAFE_INTEGER, serverTime: Date.now(), status: 'cancelled', reason, finishedAt: new Date().toISOString() };
}
module.exports = { configure, start, current, stop, cancelled, room };
