const test = require('node:test');
const assert = require('node:assert/strict');
const globalChatService = require('../src/services/globalChat.service');
const registerGlobalChatSocket = require('../src/socket/globalChat.socket');
const globalChatMigration = require('../src/migrations/202609010003-global-chat-messages');

test('global chat migration creates its missing table and history index', async () => {
  const calls = [];
  const queryInterface = {
    async showAllTables() { return []; },
    async createTable(name, columns) { calls.push({ type: 'table', name, columns }); },
    async showIndex() { return []; },
    async addIndex(table, fields, options) { calls.push({ type: 'index', table, fields, options }); },
  };

  await globalChatMigration.up({ queryInterface, transaction: {} });

  const tableCall = calls.find((call) => call.type === 'table');
  assert.equal(tableCall.name, 'global_chat_messages');
  assert.ok(tableCall.columns.senderParticipantId);
  assert.ok(tableCall.columns.senderRole);
  assert.ok(tableCall.columns.content);
  assert.ok(tableCall.columns.createdAt);
  assert.equal(calls.find((call) => call.type === 'index').options.name, 'global_chat_messages_created_at');
});

test('global chat trusts authenticated socket identity and broadcasts only to event rooms', async () => {
  const originalSend = globalChatService.sendAsParticipant;
  const calls = [];
  const broadcasts = [];
  const handlers = {};
  globalChatService.sendAsParticipant = async (...args) => {
    calls.push(args);
    return { id: 1, content: args[2] };
  };

  const io = {
    rooms: [],
    to(room) { this.rooms.push(room); return this; },
    emit(event, message) { broadcasts.push({ rooms: [...this.rooms], event, message }); },
  };
  const socket = {
    data: { user: { role: 'PARTICIPANT' }, sessionId: 3, participantId: 7 },
    on(event, handler) { handlers[event] = handler; },
  };

  try {
    registerGlobalChatSocket(io, socket);
    const response = await new Promise((resolve) => {
      handlers['globalChat:send']({ content: '안녕하세요', participantId: 999 }, resolve);
    });

    assert.deepEqual(calls, [[3, 7, '안녕하세요']]);
    assert.equal(response.ok, true);
    assert.deepEqual(broadcasts, [{
      rooms: ['participants', 'monitors', 'admins'],
      event: 'globalChat:message',
      message: { id: 1, content: '안녕하세요' },
    }]);
  } finally {
    globalChatService.sendAsParticipant = originalSend;
  }
});
