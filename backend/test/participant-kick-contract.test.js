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
  assert.match(routes, /participants\/:participantId\/restore/);
  assert.match(controller, /participant:kicked/);
  assert.match(controller, /admin:participants-updated/);
});

test('kicked participant tokens and repeat QR entry are rejected', () => {
  const auth = read('backend/src/middleware/auth.js');
  const socketAuth = read('backend/src/socket/auth.socket.js');
  const entry = read('backend/src/services/entry.service.js');
  assert.match(auth, /participant\.kickedAt/);
  assert.match(socketAuth, /participant\.kickedAt/);
  assert.match(entry, /PARTICIPANT_KICKED/);
  assert.match(entry, /clientId: data\.clientId, kickedAt/);
});

test('admin UI exposes an individual participant management tab', () => {
  const html = read('frontend/admin.html');
  const app = read('frontend/js/admin-app.js');
  assert.match(html, /data-tab="participants"/);
  assert.match(html, /접속 사용자 관리/);
  assert.match(app, /강제 퇴장/);
  assert.match(app, /차단 해제/);
});
