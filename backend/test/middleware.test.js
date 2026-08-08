const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
const requireRole = require('../src/middleware/require-role');
const { validateBody } = require('../src/middleware/validate');
const socketAuth = require('../src/socket/auth.socket');

test('requireRole allows matching roles', () => {
  let called = false;
  requireRole('ADMIN')({ user: { role: 'ADMIN' } }, {}, () => { called = true; });
  assert.equal(called, true);
});

test('validateBody removes fields not declared in the schema', () => {
  const req = { body: { nickname: 'team', status: 'CLOSED' } };
  validateBody({ nickname: { required: true, type: 'string' } })(req, {}, (error) => {
    assert.equal(error, undefined);
  });
  assert.deepEqual(req.body, { nickname: 'team' });
});

test('socketAuth reads and verifies the handshake JWT', () => {
  const token = jwt.sign({ role: 'PARTICIPANT', sessionId: 7 }, env.jwtSecret);
  const socket = { handshake: { auth: { token }, headers: {} }, data: {} };
  socketAuth(socket, (error) => assert.equal(error, undefined));
  assert.equal(socket.data.sessionId, 7);
  assert.equal(socket.data.user.role, 'PARTICIPANT');
});
