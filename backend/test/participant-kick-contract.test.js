const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('admin can list, kick and restore individual participants', () => {
  const routes = read('backend/src/routes/admin.routes.js');
  const controller = read('backend/src/controllers/admin.controller.js');
  assert.match(routes, /router\.get\('\/participants'/);
  assert.match(routes, /participants\/:participantId\/kick/);
  assert.match(routes, /participants\/:participantId\/end-access/);
  assert.match(routes, /participants\/:participantId\/restore/);
  assert.match(controller, /participant:kicked/);
  assert.match(controller, /admin:participants-updated/);
});

test('access end allows re-entry while forced removal blocks repeat QR entry', () => {
  const auth = read('backend/src/middleware/auth.js');
  const socketAuth = read('backend/src/socket/auth.socket.js');
  const entry = read('backend/src/services/entry.service.js');
  assert.match(auth, /participant\.kickedAt/);
  assert.match(socketAuth, /participant\.kickedAt/);
  assert.match(auth, /participant\.blockedAt/);
  assert.match(socketAuth, /participant\.blockedAt/);
  assert.match(entry, /PARTICIPANT_BLOCKED/);
  assert.match(entry, /blockedParticipant/);
  assert.match(entry, /gender/);
  assert.match(entry, /tableSessionId: session\.id, clientId: data\.clientId/);
  assert.match(entry, /participant\.update\(\{ kickedAt: null, kickedReason: null \}/);
});

test('admin UI exposes an individual participant management tab', () => {
  const html = read('frontend/admin.html');
  const app = read('frontend/js/admin-app.js');
  assert.match(html, /data-tab="participants"/);
  assert.match(html, /접속 사용자 관리/);
  assert.match(html, /현재 세션/);
  assert.match(html, /지난 세션/);
  assert.match(app, /강제 퇴장/);
  assert.match(app, /이용 종료/);
  assert.match(app, /재접속 가능/);
  assert.match(app, /정말 강제 퇴장하시겠습니까/);
});
