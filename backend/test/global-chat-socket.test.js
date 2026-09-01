const test = require('node:test');
const assert = require('node:assert/strict');
const globalChatService = require('../src/services/globalChat.service');
const registerGlobalChatSocket = require('../src/socket/globalChat.socket');

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
      rooms: ['participants', 'admins'],
      event: 'globalChat:message',
      message: { id: 1, content: '안녕하세요' },
    }]);
  } finally {
    globalChatService.sendAsParticipant = originalSend;
  }
});
