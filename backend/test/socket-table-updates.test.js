const test = require('node:test');
const assert = require('node:assert/strict');
const entryController = require('../src/controllers/entry.controller');
const adminController = require('../src/controllers/admin.controller');
const chatController = require('../src/controllers/chat.controller');
const lifecycleService = require('../src/services/lifecycle.service');
const entryService = require('../src/services/entry.service');
const tableService = require('../src/services/table.service');
const chatService = require('../src/services/chat.service');
const notificationService = require('../src/services/notification.service');
const { emitPublicTableUpdate } = require('../src/socket/table-updates');

function createIo() {
  const calls = [];
  const io = {
    rooms: [],
    to(room) {
      this.rooms.push(room);
      return this;
    },
    in(room) {
      this.rooms.push(room);
      return this;
    },
    emit(event, payload) {
      calls.push({ rooms: [...this.rooms], event, payload });
      this.rooms = [];
      return this;
    },
    socketsJoin(room) {
      calls.push({ rooms: [...this.rooms], event: 'socketsJoin', payload: room });
      this.rooms = [];
      return this;
    },
    socketsLeave(room) {
      calls.push({ rooms: [...this.rooms], event: 'socketsLeave', payload: room });
      this.rooms = [];
      return this;
    },
  };
  return { io, calls };
}

function mockReq(io, body = {}, params = {}, user = {}) {
  return {
    body,
    params,
    user,
    app: { get: (key) => (key === 'io' ? io : null) },
  };
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function hasPublicUpdate(calls, reason, tableIds) {
  return calls.some((call) => (
    call.event === 'table:updated'
    && call.payload.reason === reason
    && JSON.stringify(call.payload.tableIds) === JSON.stringify(tableIds)
  ));
}

async function withPatched(target, key, replacement, run) {
  const original = target[key];
  target[key] = replacement;
  try {
    return await run();
  } finally {
    target[key] = original;
  }
}

test('public table update is emitted to participants, monitors and admins once', () => {
  const { io, calls } = createIo();

  emitPublicTableUpdate(io, { tableIds: [2, '2', null, 3], reason: 'test' });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].rooms, ['participants', 'monitors', 'admins']);
  assert.equal(calls[0].event, 'table:updated');
  assert.deepEqual(calls[0].payload, { tableIds: [2, 3], reason: 'test' });
});

test('QR entry emits participant join to the session and public table update to viewers', async () => {
  const { io, calls } = createIo();
  await withPatched(entryService, 'enter', async () => ({
    table: { id: 7, tableNumber: 7 },
    session: { id: 70, tableId: 7 },
    participant: { id: 700, nickname: 'A' },
    token: 'token',
    restored: false,
  }), async () => {
    await entryController.enter(mockReq(io), mockRes(), assert.fail);
  });

  assert.deepEqual(calls.map((call) => call.event), ['participant:joined', 'admin:participants-updated', 'table:updated']);
  assert.deepEqual(calls[0].rooms, ['session:70']);
  assert.deepEqual(calls[1].rooms, ['admins']);
  assert.deepEqual(calls[2].rooms, ['participants', 'monitors', 'admins']);
  assert.deepEqual(calls[2].payload, { tableIds: [7], reason: 'entry:joined' });
});

test('admin extend keeps table:extended on the target session and emits public refresh separately', async () => {
  const { io, calls } = createIo();
  await withPatched(tableService, 'extendTable', async () => ({ id: 11, tableId: 1, expiresAt: new Date() }), async () => {
    await adminController.extend(mockReq(io, { minutes: 10 }, { tableId: 1 }), mockRes(), assert.fail);
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].rooms, ['session:11']);
  assert.equal(calls[0].event, 'table:extended');
  assert.deepEqual(calls[1].rooms, ['participants', 'monitors', 'admins']);
  assert.equal(calls[1].event, 'table:updated');
});

test('lifecycle checkout emits table:checked-out only to ended session and public update to viewers', async () => {
  const { io, calls } = createIo();
  await withPatched(notificationService, 'notifySessions', async () => {}, async () => {
    lifecycleService.emitLifecycle(io, {
      session: { id: 21, tableId: 2 },
      closedRooms: [{
        id: 9,
        requesterSessionId: 21,
        targetSessionId: 31,
        requesterSession: { id: 21, tableId: 2 },
        targetSession: { id: 31, tableId: 3 },
      }],
      cancelledRooms: [],
    });
  });

  const checkout = calls.find((call) => call.event === 'table:checked-out');
  const publicUpdate = calls.find((call) => call.event === 'table:updated');

  assert.deepEqual(checkout.rooms, ['session:21']);
  assert.deepEqual(publicUpdate.rooms, ['participants', 'monitors', 'admins']);
  assert.deepEqual(publicUpdate.payload.tableIds, [2, 3]);
});

test('chat start and end emit public updates for both tables', async () => {
  const { io, calls } = createIo();
  const rawRoom = { id: 5, requesterSessionId: 10, targetSessionId: 20 };
  const room = {
    ...rawRoom,
    roomId: 5,
    requesterSession: { id: 10, tableId: 1 },
    targetSession: { id: 20, tableId: 2 },
  };

  await withPatched(notificationService, 'notifySessions', async () => {}, async () => (
    withPatched(chatService, 'acceptRequest', async () => rawRoom, async () => (
      withPatched(chatService, 'decorateRoom', async () => room, async () => {
        await chatController.acceptRequest(mockReq(io, {}, { roomId: 5 }, { sessionId: 20 }), mockRes(), assert.fail);
      })
    ))
  ));

  assert.equal(hasPublicUpdate(calls, 'chat:started', [1, 2]), true);

  calls.length = 0;
  await withPatched(notificationService, 'notifySessions', async () => {}, async () => (
    withPatched(chatService, 'endRoom', async () => rawRoom, async () => (
      withPatched(chatService, 'decorateRoom', async () => room, async () => {
        await chatController.endRoom(mockReq(io, {}, { roomId: 5 }, { sessionId: 10 }), mockRes(), assert.fail);
      })
    ))
  ));

  assert.equal(hasPublicUpdate(calls, 'chat:ended', [1, 2]), true);
});
