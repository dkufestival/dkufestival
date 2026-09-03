const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const adminController = require('../src/controllers/admin.controller');
const { Participant } = require('../src/models');

const root = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('participant UI immediately clears global chat and accepts raw cancelled request ids', () => {
  const app = read('frontend/js/app.js');
  assert.match(app, /socket\.on\('globalChat:cleared'[\s\S]*state\.globalChatMessages = \[\]/);
  assert.match(app, /const roomId = room\.roomId \?\? room\.id/);
});

test('admin board list exposes delete and participant contact actions', () => {
  const admin = read('frontend/js/admin-app.js');
  const routes = read('backend/src/routes/admin.routes.js');
  const controller = read('backend/src/controllers/admin.controller.js');
  assert.match(admin, /boardApi\.remove\(post\.id, 'ADMIN'\)/);
  assert.match(admin, /adminApi\.messageParticipant/);
  assert.match(routes, /participants\/:participantId\/message/);
  assert.match(controller, /emit\('admin:message'/);
});

test('admin contact sends the message only to the selected participant room', async () => {
  const original = Participant.findByPk;
  const calls = [];
  const io = {
    room: null,
    to(room) { this.room = room; return this; },
    emit(event, payload) { calls.push({ room: this.room, event, payload }); return this; },
  };
  Participant.findByPk = async () => ({
    id: 77,
    kickedAt: null,
    blockedAt: null,
    session: { status: 'ACTIVE', expiresAt: new Date(Date.now() + 60000) },
  });
  try {
    const response = { body: null, json(body) { this.body = body; return this; } };
    await adminController.messageParticipant({
      params: { participantId: '77' },
      body: { content: '테스트 연락' },
      app: { get: () => io },
    }, response, assert.fail);
    assert.equal(response.body.data.sent, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].room, 'participant:77');
    assert.equal(calls[0].event, 'admin:message');
    assert.equal(calls[0].payload.content, '테스트 연락');
  } finally {
    Participant.findByPk = original;
  }
});
