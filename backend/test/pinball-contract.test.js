const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { injectViewer } = require('../src/services/pinball-page.service');

const viewerSource = fs.readFileSync(path.resolve(__dirname, '..', '..', 'frontend/pinball-local/pinball.js'), 'utf8');
const { normalizePinballEntries } = require('../src/services/game.service');

test('pinball game is registered with admin names and participant viewer', () => {
  const modelSource = fs.readFileSync(path.join(__dirname, '../src/models/GameSession.js'), 'utf8');
  const serviceSource = fs.readFileSync(path.join(__dirname, '../src/services/game.service.js'), 'utf8');
  const adminSource = fs.readFileSync(path.join(__dirname, '../../frontend/js/admin-app.js'), 'utf8');
  const participantSource = fs.readFileSync(path.join(__dirname, '../../frontend/js/app.js'), 'utf8');

  assert.match(modelSource, /'PINBALL'/);
  assert.match(serviceSource, /INVALID_PINBALL_NAMES/);
  assert.match(adminSource, /parsePinballEntries/);
  assert.match(participantSource, /showPinballScreen/);
  assert.match(participantSource, /if \(game\.type === 'PINBALL'\)[\s\S]*showPinballScreen\(game\)/);
  assert.doesNotMatch(participantSource, /const pinballCard/);
  assert.match(participantSource, /window\.location\.href = '\/basketball\/'/);
  assert.match(participantSource, /window\.location\.href = '\/stopwatch\/'/);
});

test('pinball proxy injects viewer controls and externalizes root assets', () => {
  const source = '<html><head></head><body><script type=module src=/roulette/app.js></script></body></html>';
  const result = injectViewer(source);

  assert.match(result, /<base href="https:\/\/lazygyu\.github\.io\/roulette\/">/);
  assert.match(result, /festival-pinball-viewer/);
  assert.match(result, /festival-pinball-viewer #notice/);
  assert.match(result, /Math\.random = makeRandom/);
  assert.match(result, /const lastPlace = marbleCount - 1/);
  assert.match(result, /src=https:\/\/lazygyu\.github\.io\/roulette\/app\.js/);
});

test('pinball entries support repeated marbles and enforce the total limit', () => {
  assert.deepEqual(normalizePinballEntries(['민수*3', '지영']), {
    entries: ['민수*3', '지영'],
    marbleCount: 4,
  });
  assert.equal(normalizePinballEntries(['민수']), null);
  assert.deepEqual(normalizePinballEntries(['민수*79', '지영']), {
    entries: ['민수*79', '지영'],
    marbleCount: 80,
  });
  assert.equal(normalizePinballEntries(['민수*80', '지영']), null);
  assert.equal(normalizePinballEntries(['민수/2', '지영']), null);
});

test('pinball viewer buffers authoritative snapshots and smooths the camera without changing physics', () => {
  assert.match(viewerSource, /INTERPOLATION_DELAY = 100/);
  assert.match(viewerSource, /MAX_SNAPSHOT_BUFFER = 10/);
  assert.match(viewerSource, /function getRenderSnapshots\(now\)/);
  assert.match(viewerSource, /new Map\(previous\.balls\.map\(\(ball\) => \[ball\.id, ball\]\)\)/);
  assert.match(viewerSource, /CAMERA_FOLLOW_SPEED = 7/);
  assert.match(viewerSource, /CAMERA_LEADER_HOLD_MS = 180/);
  assert.match(viewerSource, /1 - Math\.exp\(-CAMERA_FOLLOW_SPEED \* deltaSeconds\)/);
  assert.doesNotMatch(viewerSource, /cameraY = targetCamera/);
});

test('pinball viewer animates observed terminal state changes without changing authoritative snapshots', () => {
  assert.match(viewerSource, /const ballTransitions = new Map\(\)/);
  assert.match(viewerSource, /FINISH_TRANSITION_MS = 350/);
  assert.match(viewerSource, /ELIMINATION_TRANSITION_MS = 350/);
  assert.match(viewerSource, /function syncBallTransitions\(snapshot, receivedAt\)/);
  assert.match(viewerSource, /!isInitialSnapshot && !previousState && nextState/);
  assert.match(viewerSource, /function drawTerminalTransitions\(now, minY, maxY\)/);
  assert.match(viewerSource, /easeOutCubic\(progress\)/);
  assert.match(viewerSource, /cameraLeaderHoldUntil = receivedAt \+ CAMERA_LEADER_HOLD_MS/);
});

test('pinball viewer caches static map and ball visuals while culling offscreen balls', () => {
  assert.match(viewerSource, /const staticCanvas = document\.createElement\('canvas'\)/);
  assert.match(viewerSource, /function rebuildStaticLayer\(\)/);
  assert.match(viewerSource, /const ballSpriteCache = new Map\(\)/);
  assert.match(viewerSource, /function ballSprite\(ball\)/);
  assert.match(viewerSource, /RENDER_MARGIN = 80/);
  assert.match(viewerSource, /ctx\.drawImage\(staticCanvas/);
  assert.match(viewerSource, /ctx\.drawImage\(cached\.sprite/);
  assert.match(viewerSource, /ballSpriteCache\.clear\(\)/);
});
