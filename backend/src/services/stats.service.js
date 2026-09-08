// Best-effort traffic statistics. No caller awaits record* methods, so a stats DB failure
// can never turn an HTTP request or Socket.IO connection into a service failure.
const { Op } = require('sequelize');
const { ServiceStat, TrafficSnapshot, Participant, TableSession } = require('../models');

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const state = {
  started: false,
  startPromise: null,
  snapshotTimer: null,
  flushPromise: null,
  pendingHttpRequests: 0,
  pendingSocketConnections: 0,
  currentSocketConnections: 0,
  participantSockets: new Map(),
  peakSocketConnections: 0,
  peakConcurrentParticipants: 0,
};

function logFailure(operation, error) {
  console.warn(`[traffic-stats] ${operation} failed: ${error.message}`);
}

function currentConcurrentParticipants() {
  return state.participantSockets.size;
}

async function exactHistoricalCounts() {
  // clientId is the existing browser identity. A participant can have rows in multiple
  // table sessions, so DISTINCT clientId is the historical unique-person definition.
  const [totalUniqueParticipants, totalSessions] = await Promise.all([
    Participant.count({ distinct: true, col: 'clientId' }),
    TableSession.count(),
  ]);
  return { totalUniqueParticipants, totalSessions };
}

async function ensureStat() {
  const totals = await exactHistoricalCounts();
  const [stat] = await ServiceStat.findOrCreate({
    where: { id: 1 },
    defaults: { id: 1, ...totals },
  });
  await stat.update(totals);
  return stat;
}

async function start() {
  if (state.startPromise) return state.startPromise;
  state.startPromise = (async () => {
    try {
      const stat = await ensureStat();
      state.peakSocketConnections = Number(stat.peakSocketConnections);
      state.peakConcurrentParticipants = Number(stat.peakConcurrentParticipants);
      state.started = true;
      state.snapshotTimer = setInterval(() => { snapshot().catch((error) => logFailure('snapshot', error)); }, SNAPSHOT_INTERVAL_MS);
      state.snapshotTimer.unref?.();
    } catch (error) {
      // A missing migration or transient DB error must not block backend startup.
      logFailure('initialization', error);
    }
  })();
  return state.startPromise;
}

function recordHttpRequest() {
  state.pendingHttpRequests += 1;
}

function recordSocketConnection(socket) {
  state.currentSocketConnections += 1;
  state.pendingSocketConnections += 1;
  if (socket.data.user?.role !== 'PARTICIPANT' || !socket.data.participantId) {
    persistPeaks();
    return;
  }
  const participantId = String(socket.data.participantId);
  const sockets = state.participantSockets.get(participantId) || new Set();
  sockets.add(socket.id);
  state.participantSockets.set(participantId, sockets);
  socket.data.statsParticipantId = participantId;
  persistPeaks();
}

function recordSocketDisconnect(socket) {
  state.currentSocketConnections = Math.max(0, state.currentSocketConnections - 1);
  const participantId = socket.data.statsParticipantId;
  if (!participantId) return;
  const sockets = state.participantSockets.get(participantId);
  if (!sockets) return;
  sockets.delete(socket.id);
  if (!sockets.size) state.participantSockets.delete(participantId);
}

function persistPeaks() {
  const sockets = state.currentSocketConnections;
  const participants = currentConcurrentParticipants();
  const updates = [];
  // Conditional UPDATE makes each peak monotonic even when more than one process writes.
  if (sockets > state.peakSocketConnections) {
    state.peakSocketConnections = sockets;
    updates.push(ServiceStat.update({ peakSocketConnections: sockets }, { where: { id: 1, peakSocketConnections: { [Op.lt]: sockets } } }));
  }
  if (participants > state.peakConcurrentParticipants) {
    state.peakConcurrentParticipants = participants;
    updates.push(ServiceStat.update({ peakConcurrentParticipants: participants }, { where: { id: 1, peakConcurrentParticipants: { [Op.lt]: participants } } }));
  }
  if (updates.length) Promise.all(updates).catch((error) => logFailure('peak update', error));
}

async function flush() {
  if (state.flushPromise) return state.flushPromise;
  const http = state.pendingHttpRequests;
  const sockets = state.pendingSocketConnections;
  if (!http && !sockets) return undefined;
  state.pendingHttpRequests -= http;
  state.pendingSocketConnections -= sockets;
  state.flushPromise = ServiceStat.increment({ totalHttpRequests: http, totalSocketConnections: sockets }, { where: { id: 1 } })
    .catch((error) => {
      state.pendingHttpRequests += http;
      state.pendingSocketConnections += sockets;
      logFailure('counter flush', error);
    })
    .finally(() => { state.flushPromise = null; });
  return state.flushPromise;
}

async function snapshot() {
  await flush();
  const stat = await ServiceStat.findByPk(1);
  if (!stat) throw new Error('service_stats singleton is missing');
  await TrafficSnapshot.create({
    recordedAt: new Date(),
    concurrentSocketConnections: state.currentSocketConnections,
    concurrentParticipants: currentConcurrentParticipants(),
    totalHttpRequests: stat.totalHttpRequests,
    totalSocketConnections: stat.totalSocketConnections,
  });
}

async function getStats({ hours = 24, limit = 288 } = {}) {
  await flush();
  const stat = await ensureStat();
  const safeHours = Math.max(1, Math.min(24 * 30, Number(hours) || 24));
  const safeLimit = Math.max(1, Math.min(288, Number(limit) || 288));
  const snapshots = await TrafficSnapshot.findAll({
    where: { recordedAt: { [Op.gte]: new Date(Date.now() - safeHours * 60 * 60 * 1000) } },
    attributes: ['recordedAt', 'concurrentSocketConnections', 'concurrentParticipants', 'totalHttpRequests', 'totalSocketConnections'],
    order: [['recordedAt', 'DESC']],
    limit: safeLimit,
  });
  return {
    summary: {
      totalUniqueParticipants: Number(stat.totalUniqueParticipants),
      totalSessions: Number(stat.totalSessions),
      currentConcurrentParticipants: currentConcurrentParticipants(),
      peakConcurrentParticipants: Number(stat.peakConcurrentParticipants),
      currentSocketConnections: state.currentSocketConnections,
      peakSocketConnections: Number(stat.peakSocketConnections),
      totalSocketConnections: Number(stat.totalSocketConnections),
      totalHttpRequests: Number(stat.totalHttpRequests),
    },
    snapshots: snapshots.reverse().map((snapshot) => snapshot.toJSON()),
  };
}

async function stop() {
  if (state.snapshotTimer) clearInterval(state.snapshotTimer);
  state.snapshotTimer = null;
  await flush();
}

module.exports = {
  start, stop, recordHttpRequest, recordSocketConnection, recordSocketDisconnect,
  flush, snapshot, getStats,
  // Exposed only for focused unit tests; callers must not mutate it in production.
  _state: state,
};
