const test = require('node:test');
const assert = require('node:assert/strict');
const globalChatService = require('../src/services/globalChat.service');
const registerGlobalChatSocket = require('../src/socket/globalChat.socket');
const adminController = require('../src/controllers/admin.controller');
const { Participant, GlobalChatMessage } = require('../src/models');

test('blocked participant cannot send global chat, while normal participant can', async () => {
  const originalFindOne = Participant.findOne;
  const originalCreate = GlobalChatMessage.create;
  const originalFindByPk = GlobalChatMessage.findByPk;
  try {
    Participant.findOne = async () => ({ id: 7, globalChatBlockedAt: new Date() });
    await assert.rejects(
      () => globalChatService.sendAsParticipant(3, 7, 'blocked'),
      (error) => error.code === 'GLOBAL_CHAT_BLOCKED' && error.message === '관리자에 의해 전체채팅 이용이 제한되었습니다.'
    );

    const created = { id: 1 };
    Participant.findOne = async () => ({ id: 7, globalChatBlockedAt: null });
    GlobalChatMessage.create = async (data) => {
      assert.equal(data.content, '첫 줄\n둘째 줄');
      return created;
    };
    GlobalChatMessage.findByPk = async () => ({ id: 1, content: '첫 줄\n둘째 줄' });
    const message = await globalChatService.sendAsParticipant(3, 7, '  첫 줄\n둘째 줄  ');
    assert.equal(message.content, '첫 줄\n둘째 줄');

    GlobalChatMessage.create = async (data) => {
      assert.equal(data.senderRole, 'ADMIN');
      assert.equal(data.content, '관리자 메시지');
      return { id: 2, ...data };
    };
    const adminMessage = await globalChatService.sendAsAdmin('관리자 메시지');
    assert.equal(adminMessage.senderRole, 'ADMIN');
  } finally {
    Participant.findOne = originalFindOne;
    GlobalChatMessage.create = originalCreate;
    GlobalChatMessage.findByPk = originalFindByPk;
  }
});

test('globalChat:send rejects a blocked participant even when invoked directly over Socket.IO', async () => {
  const originalFindOne = Participant.findOne;
  const handlers = {};
  const socket = {
    data: { user: { role: 'PARTICIPANT' }, sessionId: 3, participantId: 7 },
    on(event, handler) { handlers[event] = handler; },
  };
  const io = { to() { return this; }, emit() {} };
  try {
    Participant.findOne = async () => ({ id: 7, globalChatBlockedAt: new Date() });
    registerGlobalChatSocket(io, socket);
    const response = await new Promise((resolve) => handlers['globalChat:send']({ content: 'blocked' }, resolve));
    assert.deepEqual(response, {
      ok: false,
      error: 'GLOBAL_CHAT_BLOCKED',
      message: '관리자에 의해 전체채팅 이용이 제한되었습니다.',
    });
  } finally {
    Participant.findOne = originalFindOne;
  }
});

test('admin global chat block and unblock update participant and notify relevant rooms', async () => {
  const originalFindByPk = Participant.findByPk;
  const changes = [];
  const events = [];
  const participant = {
    id: 7,
    globalChatBlockedAt: null,
    globalChatBlockedReason: null,
    async update(values) {
      Object.assign(this, values);
      changes.push(values);
      return this;
    },
  };
  const io = {
    room: null,
    to(room) { this.room = room; return this; },
    emit(event, payload) { events.push({ room: this.room, event, payload }); return this; },
  };
  const response = { body: null, json(body) { this.body = body; return this; } };
  try {
    Participant.findByPk = async () => participant;
    await adminController.blockParticipantGlobalChat({ params: { participantId: '7' }, body: { reason: 'test' }, app: { get: () => io } }, response, assert.fail);
    assert.ok(changes[0].globalChatBlockedAt instanceof Date);
    assert.equal(changes[0].globalChatBlockedReason, 'test');
    assert.ok(events.some((event) => event.room === 'admins' && event.event === 'admin:participants-updated'));
    assert.ok(events.some((event) => event.room === 'participant:7' && event.event === 'participant:global-chat-blocked'));

    await adminController.unblockParticipantGlobalChat({ params: { participantId: '7' }, body: {}, app: { get: () => io } }, response, assert.fail);
    assert.deepEqual(changes[1], { globalChatBlockedAt: null, globalChatBlockedReason: null });
    assert.ok(events.some((event) => event.room === 'participant:7' && event.event === 'participant:global-chat-unblocked'));
  } finally {
    Participant.findByPk = originalFindByPk;
  }
});

test('chat inputs use textareas and Enter has no message-send handler', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..', '..');
  const html = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'frontend/js/app.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'frontend/style.css'), 'utf8');
  assert.match(html, /<textarea id="chat-input"/);
  assert.match(html, /<textarea id="global-chat-input"/);
  assert.doesNotMatch(app, /chat-input'\)\.addEventListener\('keydown'/);
  assert.doesNotMatch(app, /global-chat-input'\)\.addEventListener\('keydown'/);
  assert.match(css, /\.chat-bubble[\s\S]*white-space: pre-wrap/);
  assert.match(css, /\.global-chat-message-content[\s\S]*white-space: pre-wrap/);
});

test('global chat includes a latest-message button with near-bottom scroll behavior', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..', '..');
  const html = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'frontend/js/app.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'frontend/style.css'), 'utf8');
  assert.match(html, /id="global-chat-scroll-bottom"[^>]*aria-label="최신 메시지로 이동"/);
  assert.match(app, /GLOBAL_CHAT_BOTTOM_THRESHOLD = 96/);
  assert.match(app, /function isGlobalChatNearBottom\(\)/);
  assert.match(app, /scrollTo\(\{ top: log\.scrollHeight, behavior: smooth \? 'smooth' : 'auto' \}\)/);
  assert.match(app, /global-chat-log'\)\.addEventListener\('scroll', updateGlobalChatScrollButton/);
  assert.match(css, /\.global-chat-scroll-bottom\.visible/);
});
