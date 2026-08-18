const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
const { defaultExpiresAt } = require('../src/services/session.service');
const { signParticipantToken } = require('../src/services/token.service');

test('participant JWT includes role, tableId, sessionId and participantId', () => {
  const token = signParticipantToken({ tableId: 1, sessionId: 2, participantId: 3 });
  const payload = jwt.verify(token, env.jwtSecret);

  assert.equal(payload.role, 'PARTICIPANT');
  assert.equal(payload.tableId, 1);
  assert.equal(payload.sessionId, 2);
  assert.equal(payload.participantId, 3);
});

test('default session expiry uses configured duration', () => {
  const startedAt = new Date('2026-08-18T00:00:00.000Z');
  const expiresAt = defaultExpiresAt(startedAt);

  assert.equal(expiresAt.toISOString(), '2026-08-18T02:00:00.000Z');
});
