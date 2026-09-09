const test = require('node:test');
const assert = require('node:assert/strict');
const { instrumentApplicationEvents } = require('../src/socket/event-metrics');

function fakeSocket() {
  const handlers = new Map(); let any;
  return {
    on(event, handler) { handlers.set(event, handler); return this; },
    onAny(handler) { any = handler; },
    receive(event) { any(event); handlers.get(event)?.(); },
  };
}

test('counts registered application events once and excludes lifecycle/unknown events', () => {
  const socket = fakeSocket(); let count = 0;
  instrumentApplicationEvents(socket, () => { count += 1; });
  socket.on('chat:send', () => {});
  socket.on('disconnect', () => {});
  socket.receive('chat:send');
  socket.receive('disconnect');
  socket.receive('ping');
  assert.equal(count, 1);
});
