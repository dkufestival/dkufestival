const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { injectViewer } = require('../src/services/pinball-page.service');
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
  assert.equal(normalizePinballEntries(['민수*51', '지영']), null);
  assert.equal(normalizePinballEntries(['민수/2', '지영']), null);
});
