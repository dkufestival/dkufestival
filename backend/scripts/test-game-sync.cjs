// Isolated browser integration test: real frontend and Socket.IO game handlers,
// in-memory game persistence and fixture REST data; no production database writes.
// PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node scripts/test-game-sync.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { Server } = require('socket.io');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { GameSession } = require('../src/models');
const registerGame = require('../src/socket/game.socket');
const root = path.resolve(__dirname, '../../frontend');
let game = null;
GameSession.findOne = async () => game;
function fixture(type, state) {
  game = { id: (game?.id || 0) + 1, mode: 'GLOBAL', type, status: 'ACTIVE', state: { lifecyclePhase: 'STARTED', ...state },
    changed() {}, async save() {}, toJSON() { return JSON.parse(JSON.stringify({ id: this.id, mode: this.mode, type: this.type, status: this.status, state: this.state })); } };
  return game;
}
const app = express();
app.get('/api/time', (req, res) => res.json({ serverTime: Date.now() }));
app.get('/api/{*rest}', (req, res) => {
  let data = [];
  if (req.path.endsWith('/tables')) data = [{ id: 1, tableNumber: 1, activeSession: { id: 1, status: 'ACTIVE', maleCount: 1, femaleCount: 1, expiresAt: new Date(Date.now() + 3600000).toISOString() } }];
  if (req.path === '/api/participants/me') data = { id: 1, nickname: '테스트' };
  if (req.path === '/api/participants') data = [{ id: 1, nickname: '테스트' }];
  if (req.path.includes('likes/mine')) data = { given: [], received: [] };
  if (req.path.endsWith('/staff-call')) data = { pending: false };
  if (req.path.includes('/active')) data = null;
  if (req.path === '/api/basketball/state') data = { personalBest: 0 };
  res.json({ data });
});
// Read-only probes exist only in this test server, never in shipped assets.
app.get('/pinball-local/pinball.js', (req, res) => res.type('js').send(fs.readFileSync(path.join(root, 'pinball-local/pinball.js'), 'utf8') + '\nglobalThis.pinballSnapshot = () => ({ simulationSteps, balls, finishOrder, eliminatedOrder, cameraY });'));
app.get('/js/game-clock.js', (req, res) => res.type('js').send(fs.readFileSync(path.join(root, 'js/game-clock.js'), 'utf8').replace('return epoch + performance.now() - origin;', 'return globalThis.testNow ?? (epoch + performance.now() - origin);')));
app.use(express.static(root));
const server = http.createServer(app);
const io = new Server(server);
io.on('connection', socket => {
  socket.data = { user: { role: socket.handshake.auth.token === 'admin' ? 'ADMIN' : 'PARTICIPANT' }, sessionId: 1, participantId: 1 };
  socket.join(socket.data.user.role === 'ADMIN' ? 'admins' : 'participants');
  registerGame(io, socket);
});
let browser;
const errors = [];
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  async function page(role = 'participant', skew = 0) {
    const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    await context.addInitScript(({role, skew}) => {
      localStorage.setItem('piumOnboardingSeenV1', '1');
      localStorage.setItem(role === 'admin' ? 'piumAdminToken' : 'piumParticipantAuth', role === 'admin' ? 'admin' : JSON.stringify({ token: 'participant', tableId: 1, tableNumber: 1, tableSessionId: 1, participantId: 1 }));
      if (skew) localStorage.setItem('festival-pinball-map-v1', JSON.stringify({ pegs: [], spinners: [], rails: [] }));
      const realNow = Date.now.bind(Date);
      Date.now = () => realNow() + skew;
    }, { role, skew });
    const p = await context.newPage();
    p.on('pageerror', e => errors.push(e.message));
    return p;
  }
  const admin = await page('admin');
  const early = await page();
  const late = await page('participant', 120000);
  fixture('TIME_MATCH', { targetMs: 10000 });
  await early.goto(base + '/basketball/');
  await early.waitForTimeout(1200);
  assert.match(early.url(), /\/basketball\/$/);
  io.emit('game:global:started', game.toJSON());
  await early.waitForTimeout(300);
  assert.match(early.url(), /\/basketball\/$/);
  await early.reload();
  await early.waitForTimeout(500);
  assert.match(early.url(), /\/basketball\/$/);
  console.log('PASS basketball remains playable with TIME_MATCH on entry, live event and reload');

  fixture('ROULETTE', { rounds: [{ options: ['A', 'B', 'C'] }, { options: ['D', 'E'] }], currentRound: 0 });
  await admin.goto(base + '/admin.html');
  await early.goto(base + '/');
  await early.waitForSelector('#screen-game.active .roulette-wheel');
  await admin.waitForSelector('#roulette-admin-stage .roulette-wheel', { state: 'attached' });
  async function action(name) {
    const response = await admin.evaluate(async name => {
      const { getSocket } = await import('/js/socket.js');
      return new Promise(resolve => getSocket().emit('game:global:update', { gameId: 2, action: name }, resolve));
    }, name);
    assert.equal(response.ok, true, JSON.stringify(response));
  }
  await action('SPIN');
  await early.waitForTimeout(1200);
  await late.goto(base + '/');
  await late.waitForSelector('#screen-game.active .roulette-wheel');
  const angle = p => p.locator('.roulette-wheel').first().evaluate(el => Number(el.style.transform.match(/[-\d.]+/)[0]));
  let angles = await Promise.all([admin, early, late].map(angle));
  assert.ok(Math.max(...angles) - Math.min(...angles) < 100, JSON.stringify(angles));
  await early.reload();
  await early.waitForSelector('#screen-game.active .roulette-wheel');
  await admin.reload();
  await admin.waitForSelector('#roulette-admin-stage .roulette-wheel', { state: 'attached' });
  await late.waitForTimeout(4400);
  angles = await Promise.all([admin, early, late].map(angle));
  assert.equal(new Set(angles).size, 1, JSON.stringify(angles));
  const results = await Promise.all([admin, early, late].map(p => p.locator('.roulette-result').first().textContent()));
  assert.equal(new Set(results).size, 1);
  await late.goto(base + '/basketball/'); // collective game redirects back to current round
  await late.waitForSelector('#screen-game.active .roulette-wheel');
  assert.equal(await angle(late), angles[0]);
  console.log('PASS roulette mid-spin delayed entry, participant/admin reload, re-entry, skewed clock and identical final angle/result');
  await action('NEXT');
  await early.waitForTimeout(250);
  assert.match(await early.locator('#game-screen-kicker').textContent(), /ROUND 2/);
  assert.match(await late.locator('#game-screen-kicker').textContent(), /ROUND 2/);
  await late.reload();
  await late.waitForSelector('#screen-game.active');
  assert.match(await late.locator('#game-screen-kicker').textContent(), /ROUND 2/);
  await action('SPIN');
  await early.waitForTimeout(4700);
  angles = await Promise.all([admin, early, late].map(angle));
  assert.equal(new Set(angles).size, 1);
  console.log('PASS roulette next round + reload + second spin');

  const startAt = Date.now() + 500;
  fixture('PINBALL', { names: ['가', '나', '다', '라'], seed: 12345, startAt });
  await admin.reload();
  await admin.locator('[data-tab="games"]').click();
  await admin.locator('#pinball-admin-frame').scrollIntoViewIfNeeded();
  await early.reload();
  await early.waitForSelector('#screen-pinball.active');
  await early.waitForTimeout(2400);
  await late.reload();
  await late.waitForSelector('#screen-pinball.active');
  const pinFrame = p => p.frames().find(f => f.url().includes('/pinball-local/'));
  async function compareAt(ms) {
    const frames = [admin, early, late].map(pinFrame);
    await Promise.all(frames.map(f => f.waitForFunction(() => typeof globalThis.pinballSnapshot === 'function')));
    await Promise.all(frames.map(f => f.evaluate(t => { globalThis.testNow = t; }, startAt + ms)));
    await Promise.all(frames.map(async (f, index) => {
      try {
        await f.waitForFunction(steps => globalThis.pinballSnapshot && (pinballSnapshot().simulationSteps >= steps || pinballSnapshot().balls.every(b => b.finished || b.eliminated)), Math.floor(ms / 1000 * 120));
      } catch (error) {
        console.error('Pinball sync timeout', index, await f.evaluate(() => ({ url: location.href, now: globalThis.testNow, snapshot: pinballSnapshot() })));
        throw error;
      }
    }));
    const snapshots = await Promise.all(frames.map(f => f.evaluate(() => pinballSnapshot())));
    // Camera viewport differs between admin and phone; physics and outcomes must match exactly.
    snapshots.forEach(s => delete s.cameraY);
    assert.deepEqual(snapshots[0], snapshots[1]);
    assert.deepEqual(snapshots[0], snapshots[2]);
    return snapshots[0];
  }
  await compareAt(6000);
  await early.reload();
  await early.waitForSelector('#screen-pinball.active');
  await compareAt(10000);
  await late.goto(base + '/basketball/');
  await late.waitForSelector('#screen-pinball.active');
  await compareAt(15000);
  const final = await compareAt(180000);
  assert.ok(final.finishOrder.length > 0, 'winner exists');
  for (const p of [admin, early, late]) {
    const f = pinFrame(p);
    assert.equal(await f.locator('#winner-close').count(), 0);
    assert.equal(await f.locator('#winner-popup').isVisible(), true);
    assert.equal(await f.locator('#winner-name').textContent(), final.finishOrder[0].name);
  }
  console.log('PASS pinball exact ball positions/rankings for delayed join, reload, re-entry, background catch-up, local map differences and +2 minute device clock; winner popup has no confirm button');
  game = null;
  await early.evaluate(async () => { const {getSocket} = await import('/js/socket.js'); getSocket().disconnect().connect(); });
  await early.waitForSelector('#screen-seats.active');
  assert.equal(await early.locator('#pinball-viewer-frame').getAttribute('src'), 'about:blank');
  assert.deepEqual(errors, []);
  console.log('PASS reconnect after game ended clears stale game; no browser JS errors');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); io.close(); server.close(); });
