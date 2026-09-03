const test = require('node:test');
const assert = require('node:assert/strict');
const sequelize = require('../src/config/db');
const chatService = require('../src/services/chat.service');
const { ChatRoom, TableSession, Participant, TableRequestBlock } = require('../src/models');

function withPatchedMethods(patches, run) {
  const originals = patches.map(([target, name]) => [target, name, target[name]]);
  patches.forEach(([target, name, value]) => {
    target[name] = value;
  });
  return Promise.resolve()
    .then(run)
    .finally(() => {
      originals.forEach(([target, name, value]) => {
        target[name] = value;
      });
    });
}

function activeSession(id) {
  return {
    id,
    acceptingRequests: true,
    setDataValue() {},
  };
}

test('blocked target rejects chat request without creating a room', async () => {
  let createCalled = false;

  await withPatchedMethods([
    [sequelize, 'transaction', async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })],
    [ChatRoom, 'findAll', async () => []],
    [ChatRoom, 'findOne', async () => null],
    [ChatRoom, 'create', async () => {
      createCalled = true;
      return {};
    }],
    [TableSession, 'findOne', async ({ where }) => activeSession(where.id)],
    [Participant, 'findOne', async () => ({ id: 10, isHost: true })],
    [TableRequestBlock, 'findOne', async ({ where }) => (
      Number(where.blockerSessionId) === 2 && Number(where.blockedSessionId) === 1 ? { id: 99 } : null
    )],
  ], async () => {
    await assert.rejects(
      () => chatService.createRequest({ sessionId: 1, participantId: 10 }, { targetSessionId: 2 }),
      (error) => {
        assert.equal(error.status, 409);
        assert.equal(error.code, 'CHAT_REQUEST_REJECTED');
        assert.equal(error.message, '요청이 거절되었습니다.');
        return true;
      }
    );
    assert.equal(createCalled, false);
  });
});

test('reverse direction is not blocked by an opposite directional block', async () => {
  let createCalled = false;

  await withPatchedMethods([
    [sequelize, 'transaction', async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })],
    [ChatRoom, 'findAll', async () => []],
    [ChatRoom, 'findOne', async () => null],
    [ChatRoom, 'create', async (body) => {
      createCalled = true;
      return {
        id: 50,
        ...body,
        setDataValue() {},
      };
    }],
    [TableSession, 'findOne', async ({ where }) => activeSession(where.id)],
    [Participant, 'findOne', async () => ({ id: 10, isHost: true })],
    [TableRequestBlock, 'findOne', async ({ where }) => (
      Number(where.blockerSessionId) === 1 && Number(where.blockedSessionId) === 2 ? { id: 99 } : null
    )],
  ], async () => {
    const room = await chatService.createRequest({ sessionId: 1, participantId: 10 }, { targetSessionId: 2 });
    assert.equal(createCalled, true);
    assert.equal(room.requesterSessionId, 1);
    assert.equal(room.targetSessionId, 2);
  });
});

test('pending requests do not make a session busy and session locks use a stable order', async () => {
  const lockedSessionIds = [];
  let createCalled = false;

  await withPatchedMethods([
    [sequelize, 'transaction', async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })],
    [ChatRoom, 'findAll', async () => []],
    [ChatRoom, 'findOne', async () => null],
    [ChatRoom, 'create', async (body) => {
      createCalled = true;
      return { id: 51, ...body, setDataValue() {} };
    }],
    [TableSession, 'findOne', async ({ where }) => {
      lockedSessionIds.push(Number(where.id));
      return activeSession(where.id);
    }],
    [Participant, 'findOne', async () => ({ id: 10, isHost: true })],
    [TableRequestBlock, 'findOne', async () => null],
  ], async () => {
    await chatService.createRequest({ sessionId: 3, participantId: 10 }, { targetSessionId: 1 });
  });

  assert.equal(createCalled, true);
  assert.deepEqual(lockedSessionIds.slice(0, 2), [1, 3]);
});

test('a duplicate pending request in the same direction is rejected', async () => {
  let createCalled = false;

  await withPatchedMethods([
    [sequelize, 'transaction', async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })],
    [ChatRoom, 'findAll', async () => []],
    [ChatRoom, 'findOne', async ({ where }) => (
      where.requesterSessionId === 1 && where.targetSessionId === 2 && where.status === 'PENDING' ? { id: 99 } : null
    )],
    [ChatRoom, 'create', async () => { createCalled = true; }],
    [TableSession, 'findOne', async ({ where }) => activeSession(where.id)],
    [Participant, 'findOne', async () => ({ id: 10, isHost: true })],
    [TableRequestBlock, 'findOne', async () => null],
  ], async () => {
    await assert.rejects(
      () => chatService.createRequest({ sessionId: 1, participantId: 10 }, { targetSessionId: 2 }),
      (error) => error.status === 409 && error.code === 'CHAT_REQUEST_ALREADY_PENDING'
    );
  });

  assert.equal(createCalled, false);
});
