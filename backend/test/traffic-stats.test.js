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
  const previous = { http: state.pendingHttpRequests, sockets: state.pendingSocketConnections, events: state.pendingSocketEvents, flush: state.flushPromise };
  const calls = [];
  ServiceStat.increment = async (values, options) => { calls.push({ values, options }); };
  state.pendingHttpRequests = 7;
  state.pendingSocketConnections = 3;
  state.pendingSocketEvents = 5;
  state.flushPromise = null;
  try {
    await stats.flush();
    assert.deepEqual(calls, [{
      values: { totalHttpRequests: 7, totalSocketConnections: 3, totalSocketEvents: 5 },
      options: { where: { id: 1 } },
    }]);
    assert.equal(state.pendingHttpRequests, 0);
    assert.equal(state.pendingSocketConnections, 0);
    assert.equal(state.pendingSocketEvents, 0);
  } finally {
    ServiceStat.increment = originalIncrement;
    state.pendingHttpRequests = previous.http;
    state.pendingSocketConnections = previous.sockets;
    state.pendingSocketEvents = previous.events;
    state.flushPromise = previous.flush;
  }
});

test('per-second HTTP and socket buckets retain 60 seconds and update rate peaks', async () => {
  const originalUpdate = ServiceStat.update;
  const state = stats._state;
  const previous = {
    http: state.currentSecondHttpRequests, events: state.currentSecondSocketEvents,
    buckets: state.secondBuckets, snapshots: state.snapshotBuckets, httpRps: state.currentHttpRps,
    eventRps: state.currentSocketEventsPerSecond, peakHttp: state.peakHttpRps, peakEvents: state.peakSocketEventsPerSecond,
  };
  ServiceStat.update = async () => [1];
  state.currentSecondHttpRequests = 0; state.currentSecondSocketEvents = 0; state.secondBuckets = []; state.snapshotBuckets = [];
  state.peakHttpRps = 0; state.peakSocketEventsPerSecond = 0;
  try {
    for (let index = 0; index < 61; index += 1) {
      state.currentSecondHttpRequests = index === 60 ? 9 : 1;
      state.currentSecondSocketEvents = index === 60 ? 4 : 2;
      await stats._advanceSecond();
    }
    assert.equal(state.currentHttpRps, 9);
    assert.equal(state.currentSocketEventsPerSecond, 4);
    assert.equal(state.secondBuckets.length, 60);
    assert.equal(state.secondBuckets[0].httpRps, 1);
    assert.equal(state.peakHttpRps, 9);
    assert.equal(state.peakSocketEventsPerSecond, 4);
  } finally {
    ServiceStat.update = originalUpdate;
    state.currentSecondHttpRequests = previous.http; state.currentSecondSocketEvents = previous.events;
    state.secondBuckets = previous.buckets; state.snapshotBuckets = previous.snapshots;
    state.currentHttpRps = previous.httpRps; state.currentSocketEventsPerSecond = previous.eventRps;
    state.peakHttpRps = previous.peakHttp; state.peakSocketEventsPerSecond = previous.peakEvents;
  }
});

test('failed stats flush restores counters without affecting callers', async () => {
  const originalIncrement = ServiceStat.increment;
  const state = stats._state;
  const previous = { http: state.pendingHttpRequests, sockets: state.pendingSocketConnections, events: state.pendingSocketEvents, flush: state.flushPromise };
  ServiceStat.increment = async () => { throw new Error('database unavailable'); };
  state.pendingHttpRequests = 1; state.pendingSocketConnections = 2; state.pendingSocketEvents = 3; state.flushPromise = null;
  try {
    await stats.flush();
    assert.deepEqual([state.pendingHttpRequests, state.pendingSocketConnections, state.pendingSocketEvents], [1, 2, 3]);
  } finally {
    ServiceStat.increment = originalIncrement;
    state.pendingHttpRequests = previous.http; state.pendingSocketConnections = previous.sockets; state.pendingSocketEvents = previous.events; state.flushPromise = previous.flush;
  }
});
