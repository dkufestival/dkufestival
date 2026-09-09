// Best-effort instrumentation: callers never await this module's DB work.
const { Op } = require('sequelize');
const { ServiceStat, TrafficSnapshot, Participant, TableSession } = require('../models');
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const state = {
  started: false, startPromise: null, snapshotTimer: null, secondTimer: null, flushPromise: null,
  pendingHttpRequests: 0, pendingSocketConnections: 0, pendingSocketEvents: 0,
  currentSecondHttpRequests: 0, currentSecondSocketEvents: 0, currentHttpRps: 0, currentSocketEventsPerSecond: 0,
  secondBuckets: [], snapshotBuckets: [], currentSocketConnections: 0, participantSockets: new Map(),
  peakSocketConnections: 0, peakConcurrentParticipants: 0, peakHttpRps: 0, peakSocketEventsPerSecond: 0,
};
function logFailure(operation, error) { console.warn(`[traffic-stats] ${operation} failed: ${error.message}`); }
function participants() { return state.participantSockets.size; }
function average(buckets, field) { return buckets.length ? buckets.reduce((n, b) => n + b[field], 0) / buckets.length : 0; }
function maximum(buckets, field) { return buckets.reduce((n, b) => Math.max(n, b[field]), 0); }
async function exactHistoricalCounts() {
  const [totalUniqueParticipants, totalSessions] = await Promise.all([Participant.count({ distinct: true, col: 'clientId' }), TableSession.count()]);
  return { totalUniqueParticipants, totalSessions };
}
async function ensureStat() {
  const totals = await exactHistoricalCounts();
  const [stat] = await ServiceStat.findOrCreate({ where: { id: 1 }, defaults: { id: 1, ...totals } });
  await stat.update(totals); return stat;
}
async function start() {
  if (state.startPromise) return state.startPromise;
  // Preserve in-memory current rates even if migrations/DB are temporarily unavailable.
  state.secondTimer = setInterval(() => { advanceSecond().catch((e) => logFailure('second tick', e)); }, 1000);
  state.snapshotTimer = setInterval(() => { snapshot().catch((e) => logFailure('snapshot', e)); }, SNAPSHOT_INTERVAL_MS);
  state.secondTimer.unref?.(); state.snapshotTimer.unref?.();
  state.startPromise = (async () => { try {
    const stat = await ensureStat();
    for (const key of ['peakSocketConnections', 'peakConcurrentParticipants', 'peakHttpRps', 'peakSocketEventsPerSecond']) state[key] = Number(stat[key]);
    state.started = true;
  } catch (e) { logFailure('initialization', e); } })();
  return state.startPromise;
}
function recordHttpRequest() { state.pendingHttpRequests += 1; state.currentSecondHttpRequests += 1; }
function recordSocketEvent() { state.pendingSocketEvents += 1; state.currentSecondSocketEvents += 1; }
function persistRatePeaks(httpRps, eventsPerSecond) {
  const updates = [];
  if (httpRps > state.peakHttpRps) { state.peakHttpRps = httpRps; updates.push(ServiceStat.update({ peakHttpRps: httpRps }, { where: { id: 1, peakHttpRps: { [Op.lt]: httpRps } } })); }
  if (eventsPerSecond > state.peakSocketEventsPerSecond) { state.peakSocketEventsPerSecond = eventsPerSecond; updates.push(ServiceStat.update({ peakSocketEventsPerSecond: eventsPerSecond }, { where: { id: 1, peakSocketEventsPerSecond: { [Op.lt]: eventsPerSecond } } })); }
  if (updates.length) Promise.all(updates).catch((e) => logFailure('rate peak update', e));
}
async function advanceSecond() {
  const bucket = { httpRps: state.currentSecondHttpRequests, socketEventsPerSecond: state.currentSecondSocketEvents };
  state.currentSecondHttpRequests = 0; state.currentSecondSocketEvents = 0;
  state.currentHttpRps = bucket.httpRps; state.currentSocketEventsPerSecond = bucket.socketEventsPerSecond;
  state.secondBuckets.push(bucket); if (state.secondBuckets.length > 60) state.secondBuckets.shift();
  state.snapshotBuckets.push(bucket); persistRatePeaks(bucket.httpRps, bucket.socketEventsPerSecond);
}
function recordSocketConnection(socket) {
  state.currentSocketConnections += 1; state.pendingSocketConnections += 1;
  if (socket.data.user?.role !== 'PARTICIPANT' || !socket.data.participantId) return persistPeaks();
  const id = String(socket.data.participantId), sockets = state.participantSockets.get(id) || new Set();
  sockets.add(socket.id); state.participantSockets.set(id, sockets); socket.data.statsParticipantId = id; persistPeaks();
}
function recordSocketDisconnect(socket) {
  state.currentSocketConnections = Math.max(0, state.currentSocketConnections - 1);
  const id = socket.data.statsParticipantId, sockets = id && state.participantSockets.get(id);
  if (!sockets) return; sockets.delete(socket.id); if (!sockets.size) state.participantSockets.delete(id);
}
function persistPeaks() {
  const updates = [], sockets = state.currentSocketConnections, activeParticipants = participants();
  if (sockets > state.peakSocketConnections) { state.peakSocketConnections = sockets; updates.push(ServiceStat.update({ peakSocketConnections: sockets }, { where: { id: 1, peakSocketConnections: { [Op.lt]: sockets } } })); }
  if (activeParticipants > state.peakConcurrentParticipants) { state.peakConcurrentParticipants = activeParticipants; updates.push(ServiceStat.update({ peakConcurrentParticipants: activeParticipants }, { where: { id: 1, peakConcurrentParticipants: { [Op.lt]: activeParticipants } } })); }
  if (updates.length) Promise.all(updates).catch((e) => logFailure('peak update', e));
}
async function flush() {
  if (state.flushPromise) return state.flushPromise;
  const http = state.pendingHttpRequests, sockets = state.pendingSocketConnections, events = state.pendingSocketEvents;
  if (!http && !sockets && !events) return undefined;
  state.pendingHttpRequests -= http; state.pendingSocketConnections -= sockets; state.pendingSocketEvents -= events;
  state.flushPromise = ServiceStat.increment({ totalHttpRequests: http, totalSocketConnections: sockets, totalSocketEvents: events }, { where: { id: 1 } })
    .catch((e) => { state.pendingHttpRequests += http; state.pendingSocketConnections += sockets; state.pendingSocketEvents += events; logFailure('counter flush', e); })
    .finally(() => { state.flushPromise = null; });
  return state.flushPromise;
}
function takeSnapshotRates() {
  const buckets = state.snapshotBuckets.splice(0);
  return { averageHttpRps: average(buckets, 'httpRps'), maxHttpRps: maximum(buckets, 'httpRps'), averageSocketEventsPerSecond: average(buckets, 'socketEventsPerSecond'), maxSocketEventsPerSecond: maximum(buckets, 'socketEventsPerSecond') };
}
async function snapshot() {
  await flush(); const stat = await ServiceStat.findByPk(1); if (!stat) throw new Error('service_stats singleton is missing');
  await TrafficSnapshot.create({ recordedAt: new Date(), concurrentSocketConnections: state.currentSocketConnections, concurrentParticipants: participants(), totalHttpRequests: stat.totalHttpRequests, totalSocketConnections: stat.totalSocketConnections, ...takeSnapshotRates() });
}
async function getStats({ hours = 24, limit = 288 } = {}) {
  await flush(); const stat = await ensureStat();
  const safeHours = Math.max(1, Math.min(720, Number(hours) || 24)), safeLimit = Math.max(1, Math.min(288, Number(limit) || 288));
  const snapshots = await TrafficSnapshot.findAll({ where: { recordedAt: { [Op.gte]: new Date(Date.now() - safeHours * 3600000) } }, attributes: ['recordedAt', 'concurrentSocketConnections', 'concurrentParticipants', 'totalHttpRequests', 'totalSocketConnections', 'averageHttpRps', 'maxHttpRps', 'averageSocketEventsPerSecond', 'maxSocketEventsPerSecond'], order: [['recordedAt', 'DESC']], limit: safeLimit });
  return { summary: {
    totalUniqueParticipants: Number(stat.totalUniqueParticipants), totalSessions: Number(stat.totalSessions), currentConcurrentParticipants: participants(), peakConcurrentParticipants: Number(stat.peakConcurrentParticipants), currentSocketConnections: state.currentSocketConnections, peakSocketConnections: Number(stat.peakSocketConnections), totalSocketConnections: Number(stat.totalSocketConnections), totalHttpRequests: Number(stat.totalHttpRequests),
    currentHttpRps: state.currentHttpRps, averageHttpRpsLastMinute: average(state.secondBuckets, 'httpRps'), peakHttpRps: Math.max(state.peakHttpRps, Number(stat.peakHttpRps)), currentSocketEventsPerSecond: state.currentSocketEventsPerSecond, averageSocketEventsPerSecondLastMinute: average(state.secondBuckets, 'socketEventsPerSecond'), peakSocketEventsPerSecond: Math.max(state.peakSocketEventsPerSecond, Number(stat.peakSocketEventsPerSecond)), totalSocketEvents: Number(stat.totalSocketEvents),
  }, snapshots: snapshots.reverse().map((row) => row.toJSON()) };
}
async function stop() { if (state.snapshotTimer) clearInterval(state.snapshotTimer); if (state.secondTimer) clearInterval(state.secondTimer); state.snapshotTimer = null; state.secondTimer = null; await flush(); }
module.exports = { start, stop, recordHttpRequest, recordSocketEvent, recordSocketConnection, recordSocketDisconnect, flush, snapshot, getStats, _advanceSecond: advanceSecond, _state: state };
