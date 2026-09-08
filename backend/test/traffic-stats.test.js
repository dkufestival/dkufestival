const test = require('node:test');
const assert = require('node:assert/strict');
const stats = require('../src/services/stats.service');
const { ServiceStat } = require('../src/models');

function socket(id, participantId = null) {
  return { id, data: { user: { role: participantId ? 'PARTICIPANT' : 'ADMIN' }, participantId } };
}

test('traffic stats count socket connections and unique concurrent participants independently', () => {
  const originalUpdate = ServiceStat.update;
  ServiceStat.update = async () => [1];
  const state = stats._state;
  const previous = {
    current: state.currentSocketConnections, pending: state.pendingSocketConnections, map: state.participantSockets,
    socketPeak: state.peakSocketConnections, participantPeak: state.peakConcurrentParticipants,
  };
  state.currentSocketConnections = 0;
  state.pendingSocketConnections = 0;
  state.participantSockets = new Map();
  try {
    const first = socket('one', 10);
    const second = socket('two', 10);
    const third = socket('three', 11);
    stats.recordSocketConnection(first);
    stats.recordSocketConnection(second);
    stats.recordSocketConnection(third);
    assert.equal(state.currentSocketConnections, 3);
    assert.equal(state.participantSockets.size, 2);
    stats.recordSocketDisconnect(second);
    assert.equal(state.currentSocketConnections, 2);
    assert.equal(state.participantSockets.size, 2);
    stats.recordSocketDisconnect(first);
    assert.equal(state.participantSockets.size, 1);
    stats.recordSocketDisconnect(third);
    assert.equal(state.currentSocketConnections, 0);
    assert.equal(state.participantSockets.size, 0);
  } finally {
    ServiceStat.update = originalUpdate;
    state.currentSocketConnections = previous.current;
    state.pendingSocketConnections = previous.pending;
    state.participantSockets = previous.map;
    state.peakSocketConnections = previous.socketPeak;
    state.peakConcurrentParticipants = previous.participantPeak;
  }
});

test('traffic stats flushes buffered HTTP and socket counters with one atomic increment', async () => {
  const originalIncrement = ServiceStat.increment;
  const state = stats._state;
  const previous = { http: state.pendingHttpRequests, sockets: state.pendingSocketConnections, flush: state.flushPromise };
  const calls = [];
  ServiceStat.increment = async (values, options) => { calls.push({ values, options }); };
  state.pendingHttpRequests = 7;
  state.pendingSocketConnections = 3;
  state.flushPromise = null;
  try {
    await stats.flush();
    assert.deepEqual(calls, [{
      values: { totalHttpRequests: 7, totalSocketConnections: 3 },
      options: { where: { id: 1 } },
    }]);
    assert.equal(state.pendingHttpRequests, 0);
    assert.equal(state.pendingSocketConnections, 0);
  } finally {
    ServiceStat.increment = originalIncrement;
    state.pendingHttpRequests = previous.http;
    state.pendingSocketConnections = previous.sockets;
    state.flushPromise = previous.flush;
  }
});
