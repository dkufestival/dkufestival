const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('time match game is registered in the model and central controls', () => {
  const modelSource = fs.readFileSync(path.join(__dirname, '../src/models/GameSession.js'), 'utf8');
  const serviceSource = fs.readFileSync(path.join(__dirname, '../src/services/game.service.js'), 'utf8');
  const adminSource = fs.readFileSync(path.join(__dirname, '../../frontend/js/admin-app.js'), 'utf8');

  assert.match(modelSource, /'TIME_MATCH'/);
  assert.match(serviceSource, /differenceMs = elapsedMs - targetMs/);
  assert.match(adminSource, /state\.selectedGame === 'TIME_MATCH'/);
});
