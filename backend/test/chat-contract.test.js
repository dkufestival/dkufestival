const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const { ChatRoom, PushSubscription } = require('../src/models');

function routeExists(method, routePath) {
  return app.router.stack.some((layer) => {
    if (layer.name !== 'router') return false;
    return layer.handle.stack.some((routeLayer) => (
      routeLayer.route?.path === routePath
      && routeLayer.route.methods[method]
    ));
  });
}

test('chat request REST contract is registered', () => {
  assert.equal(routeExists('post', '/requests'), true);
  assert.equal(routeExists('get', '/requests'), true);
  assert.equal(routeExists('post', '/requests/:roomId/accept'), true);
  assert.equal(routeExists('post', '/requests/:roomId/reject'), true);
  assert.equal(routeExists('delete', '/requests/:roomId'), true);
  assert.equal(routeExists('get', '/active'), true);
  assert.equal(routeExists('post', '/rooms/:roomId/end'), true);
});

test('chat room model carries request and lifecycle state', () => {
  const attrs = ChatRoom.rawAttributes;
  [
    'requesterSessionId',
    'targetSessionId',
    'requestedByParticipantId',
    'requestMessage',
    'status',
    'requestExpiresAt',
    'acceptedAt',
    'endedAt',
    'endedByParticipantId',
    'endReason',
  ].forEach((name) => assert.ok(attrs[name], `${name} must exist`));
  assert.deepEqual(attrs.status.values, ['PENDING', 'ACTIVE', 'REJECTED', 'CANCELLED', 'EXPIRED', 'CLOSED']);
});

test('push subscription model stores browser subscription keys', () => {
  const attrs = PushSubscription.rawAttributes;
  assert.ok(attrs.participantId);
  assert.ok(attrs.endpoint);
  assert.ok(attrs.p256dh);
  assert.ok(attrs.auth);
});
