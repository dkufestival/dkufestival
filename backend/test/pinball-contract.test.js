const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { injectViewer } = require('../src/services/pinball-page.service');

test('pinball game is registered with admin names and participant viewer', () => {
  const modelSource = fs.readFileSync(path.join(__dirname, '../src/models/GameSession.js'), 'utf8');
  const serviceSource = fs.readFileSync(path.join(__dirname, '../src/services/game.service.js'), 'utf8');
  const adminSource = fs.readFileSync(path.join(__dirname, '../../frontend/js/admin-app.js'), 'utf8');
  const participantSource = fs.readFileSync(path.join(__dirname, '../../frontend/js/app.js'), 'utf8');

  assert.match(modelSource, /'PINBALL'/);
  assert.match(serviceSource, /INVALID_PINBALL_NAMES/);
  assert.match(adminSource, /pinballNames/);
  assert.match(participantSource, /showPinballScreen/);
});

test('pinball proxy injects viewer controls and externalizes root assets', () => {
  const source = '<html><head></head><body><script type=module src=/roulette/app.js></script></body></html>';
  const result = injectViewer(source);

  assert.match(result, /<base href="https:\/\/lazygyu\.github\.io\/roulette\/">/);
  assert.match(result, /festival-pinball-viewer/);
  assert.match(result, /Math\.random = makeRandom/);
  assert.match(result, /src=https:\/\/lazygyu\.github\.io\/roulette\/app\.js/);
});
