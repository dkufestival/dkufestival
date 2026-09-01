const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeScore } = require('../src/services/basketball-score.service');

test('basketball is a centrally managed single-server game with a persistent top-three leaderboard', () => {
  const model = fs.readFileSync(path.join(__dirname, '../src/models/GameSession.js'), 'utf8');
  const gameService = fs.readFileSync(path.join(__dirname, '../src/services/game.service.js'), 'utf8');
  const scoreService = fs.readFileSync(path.join(__dirname, '../src/services/basketball-score.service.js'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  const admin = fs.readFileSync(path.join(__dirname, '../../frontend/js/admin-app.js'), 'utf8');
  const participant = fs.readFileSync(path.join(__dirname, '../../frontend/js/app.js'), 'utf8');
  const game = fs.readFileSync(path.join(__dirname, '../../frontend/basketball/basketball.js'), 'utf8');

  assert.match(model, /'BASKETBALL'/);
  assert.match(gameService, /'BASKETBALL'/);
  assert.match(scoreService, /limit: 3/);
  assert.match(scoreService, /bestScore.*DESC/);
  assert.match(app, /app\.use\('\/api\/basketball'/);
  assert.match(app, /express\.static/);
  assert.match(admin, /renderBasketballLeaderboard/);
  assert.match(participant, /appendBasketballLeaderboard/);
  assert.match(game, /basketball:leaderboard/);
  assert.match(game, /\/api\/basketball\/scores/);
});

test('basketball scores only accept realistic positive integer streaks', () => {
  assert.equal(normalizeScore('12'), 12);
  assert.throws(() => normalizeScore(0), (error) => error.code === 'INVALID_BASKETBALL_SCORE');
  assert.throws(() => normalizeScore(1.5), (error) => error.code === 'INVALID_BASKETBALL_SCORE');
  assert.throws(() => normalizeScore(10001), (error) => error.code === 'INVALID_BASKETBALL_SCORE');
});
