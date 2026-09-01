const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('imported recreation games are wired to model, admin and participant screens', () => {
  const model = fs.readFileSync(path.join(__dirname, '../src/models/GameSession.js'), 'utf8');
  const service = fs.readFileSync(path.join(__dirname, '../src/services/game.service.js'), 'utf8');
  const admin = fs.readFileSync(path.join(__dirname, '../../frontend/js/admin-app.js'), 'utf8');
  const participant = fs.readFileSync(path.join(__dirname, '../../frontend/js/app.js'), 'utf8');
  const socket = fs.readFileSync(path.join(__dirname, '../src/socket/game.socket.js'), 'utf8');
  for (const type of ['OX_QUIZ', 'RPS', 'WORD_GUESS', 'ROULETTE', 'IMAGE_GAME']) {
    assert.match(model, new RegExp(type));
    assert.match(admin, new RegExp(type));
    assert.match(participant, new RegExp(type));
  }
  assert.match(service, /INVALID_GAME_CONFIG/);
  assert.match(service, /updateGlobalGame/);
  assert.match(admin, /reveal-answer-btn/);
  assert.match(participant, /showRoundResult/);
  assert.match(socket, /game:global:round/);
  assert.match(socket, /game:global:answer/);
  assert.match(socket, /game:global:spin/);
  assert.match(socket, /game:global:prompt/);
  assert.match(participant, /createRouletteWheel/);
  assert.match(participant, /playRpsReveal/);
  assert.match(service, /NEXT_PROMPT/);
  assert.match(service, /ANSWER_ALREADY_SUBMITTED/);
  assert.match(participant, /submittedGameAnswers/);
  assert.match(admin, /\['PINBALL', 'ROULETTE'\]/);
});
