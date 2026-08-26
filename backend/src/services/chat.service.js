const { Op } = require('sequelize');
const sequelize = require('../config/db');
const { ChatRoom, ChatMessage, TableSession, Participant, Table } = require('../models');
const AppError = require('../errors/AppError');

const BUSY_STATUSES = ['PENDING', 'ACTIVE'];
const REQUEST_MS = 60 * 1000;

function sessionPair(a, b) {
  return [Number(a), Number(b)].sort((left, right) => left - right);
}

function now() {
  return new Date();
}

function isExpired(room, at = now()) {
  return room.status === 'PENDING' && room.requestExpiresAt && new Date(room.requestExpiresAt) <= at;
}

async function requireActiveSession(sessionId, code = 'SESSION_NOT_FOUND', options = {}) {
  const session = await TableSession.findOne({
    where: { id: sessionId, status: 'ACTIVE', expiresAt: { [Op.gt]: now() } },
    include: [
      { model: Participant, as: 'participants' },
      { model: Table, as: 'table', attributes: ['id', 'tableNumber'] },
    ],
    transaction: options.transaction,
    lock: options.lock,
  });
  if (!session) throw new AppError(404, code, 'Active table session not found.');
  return session;
}

async function requireHost(participantId, sessionId, transaction) {
  const participant = await Participant.findOne({
    where: { id: participantId, tableSessionId: sessionId, isHost: true },
    transaction,
  });
  if (!participant) throw new AppError(403, 'HOST_REQUIRED', 'Only the table host can perform this action.');
  return participant;
}

function participantCanUseRoom(room, sessionId) {
  return [room.requesterSessionId, room.targetSessionId, room.sessionAId, room.sessionBId]
    .map(Number)
    .includes(Number(sessionId));
}

async function expirePendingRooms(options = {}) {
  const at = options.now || now();
  const rooms = await ChatRoom.findAll({
    where: {
      status: 'PENDING',
      requestExpiresAt: { [Op.lte]: at },
    },
    transaction: options.transaction,
  });
  for (const room of rooms) {
    await room.update({ status: 'EXPIRED' }, { transaction: options.transaction });
  }
  return rooms;
}

async function assertSessionAvailable(sessionId, transaction, excludeRoomId = null) {
  const active = await ChatRoom.findOne({
    where: {
      ...(excludeRoomId ? { id: { [Op.ne]: excludeRoomId } } : {}),
      status: { [Op.in]: BUSY_STATUSES },
      [Op.or]: [{ requesterSessionId: sessionId }, { targetSessionId: sessionId }],
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (active) throw new AppError(409, 'SESSION_CHAT_BUSY', 'Table session already has a pending or active chat.');
}

async function createRequest(user, data) {
  const requesterSessionId = Number(user.sessionId);
  const targetSessionId = Number(data.targetSessionId);
  if (requesterSessionId === targetSessionId) {
    throw new AppError(400, 'INVALID_CHAT_TARGET', 'Cannot request chat with the same table session.');
  }

  return sequelize.transaction(async (transaction) => {
    await expirePendingRooms({ transaction });
    const [requesterSession, targetSession] = await Promise.all([
      requireActiveSession(requesterSessionId, 'SESSION_NOT_FOUND', { transaction, lock: transaction.LOCK.UPDATE }),
      requireActiveSession(targetSessionId, 'TARGET_SESSION_NOT_FOUND', { transaction, lock: transaction.LOCK.UPDATE }),
    ]);
    await requireHost(user.participantId, requesterSessionId, transaction);
    if (!targetSession.acceptingRequests) {
      throw new AppError(409, 'REQUESTS_DISABLED', '합석 요청이 꺼져있어 합석이 불가능합니다.');
    }
    await assertSessionAvailable(requesterSessionId, transaction);
    await assertSessionAvailable(targetSessionId, transaction);

    const [sessionAId, sessionBId] = sessionPair(requesterSessionId, targetSessionId);
    const room = await ChatRoom.create({
      requesterSessionId,
      targetSessionId,
      requestedByParticipantId: user.participantId,
      requestMessage: data.message || null,
      status: 'PENDING',
      requestExpiresAt: new Date(now().getTime() + REQUEST_MS),
      sessionAId,
      sessionBId,
    }, { transaction });

    room.setDataValue('requesterSession', requesterSession);
    room.setDataValue('targetSession', targetSession);
    return room;
  });
}

async function decorateRoom(room, sessionId) {
  if (!room) return null;
  const withSessions = await ChatRoom.findByPk(room.id, {
    include: [
      { model: TableSession, as: 'requesterSession', include: [{ model: Table, as: 'table', attributes: ['id', 'tableNumber'] }] },
      { model: TableSession, as: 'targetSession', include: [{ model: Table, as: 'table', attributes: ['id', 'tableNumber'] }] },
    ],
  });
  const json = withSessions.toJSON();
  const direction = Number(json.requesterSessionId) === Number(sessionId) ? 'sent' : 'received';
  const peer = direction === 'sent' ? json.targetSession : json.requesterSession;
  return {
    ...json,
    roomId: json.id,
    direction,
    peerTableId: peer?.table?.id || null,
    peerTableNumber: peer?.table?.tableNumber || null,
    peerMaleCount: peer?.maleCount || 0,
    peerFemaleCount: peer?.femaleCount || 0,
  };
}

async function listRequests(sessionId, query = {}) {
  await expirePendingRooms();
  const where = {
    [Op.or]: [{ requesterSessionId: sessionId }, { targetSessionId: sessionId }],
  };
  if (query.status) where.status = query.status;
  if (query.direction === 'sent') where.requesterSessionId = sessionId;
  if (query.direction === 'received') where.targetSessionId = sessionId;
  const rooms = await ChatRoom.findAll({ where, order: [['createdAt', 'DESC']] });
  const filtered = rooms.filter((room) => (
    !query.direction
    || (query.direction === 'sent' && Number(room.requesterSessionId) === Number(sessionId))
    || (query.direction === 'received' && Number(room.targetSessionId) === Number(sessionId))
  ));
  return Promise.all(filtered.map((room) => decorateRoom(room, sessionId)));
}

async function getRequestForChange(roomId, sessionId, participantId, action, transaction) {
  const room = await ChatRoom.findByPk(roomId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!room) throw new AppError(404, 'CHAT_REQUEST_NOT_FOUND', 'Chat request not found.');
  if (isExpired(room)) {
    await room.update({ status: 'EXPIRED' }, { transaction });
    throw new AppError(409, 'CHAT_REQUEST_EXPIRED', 'Chat request has expired.');
  }
  if (room.status !== 'PENDING') throw new AppError(409, 'CHAT_REQUEST_CLOSED', 'Chat request is already closed.');

  if (action === 'accept' || action === 'reject') {
    if (Number(room.targetSessionId) !== Number(sessionId)) {
      throw new AppError(403, 'CHAT_REQUEST_FORBIDDEN', 'No permission to answer this request.');
    }
    await requireHost(participantId, sessionId, transaction);
  }
  if (action === 'cancel') {
    if (Number(room.requesterSessionId) !== Number(sessionId)) {
      throw new AppError(403, 'CHAT_REQUEST_FORBIDDEN', 'No permission to cancel this request.');
    }
    await requireHost(participantId, sessionId, transaction);
  }
  return room;
}

async function acceptRequest(roomId, user) {
  return sequelize.transaction(async (transaction) => {
    await expirePendingRooms({ transaction });
    const room = await getRequestForChange(roomId, user.sessionId, user.participantId, 'accept', transaction);
    await assertSessionAvailable(room.requesterSessionId, transaction, room.id);
    await assertSessionAvailable(room.targetSessionId, transaction, room.id);
    await room.update({ status: 'ACTIVE', acceptedAt: now() }, { transaction });
    return room;
  });
}

async function rejectRequest(roomId, user) {
  return sequelize.transaction(async (transaction) => {
    const room = await getRequestForChange(roomId, user.sessionId, user.participantId, 'reject', transaction);
    await room.update({ status: 'REJECTED', rejectedAt: now() }, { transaction });
    return room;
  });
}

async function cancelRequest(roomId, user) {
  return sequelize.transaction(async (transaction) => {
    const room = await getRequestForChange(roomId, user.sessionId, user.participantId, 'cancel', transaction);
    await room.update({ status: 'CANCELLED', cancelledAt: now() }, { transaction });
    return room;
  });
}

async function getActive(sessionId) {
  await expirePendingRooms();
  const room = await ChatRoom.findOne({
    where: {
      status: 'ACTIVE',
      [Op.or]: [{ requesterSessionId: sessionId }, { targetSessionId: sessionId }],
    },
    order: [['acceptedAt', 'DESC']],
  });
  return decorateRoom(room, sessionId);
}

async function requireRoomMember(roomId, sessionId, options = {}) {
  const room = await ChatRoom.findOne({
    where: {
      id: roomId,
      status: 'ACTIVE',
      [Op.or]: [{ requesterSessionId: sessionId }, { targetSessionId: sessionId }],
    },
    transaction: options.transaction,
  });
  if (!room) throw new AppError(403, 'CHAT_FORBIDDEN', 'No access to this active chat room.');
  return room;
}

async function getMessages(roomId, sessionId) {
  await requireRoomMember(roomId, sessionId);
  return ChatMessage.findAll({
    where: { roomId },
    include: [{ model: Participant, as: 'senderParticipant', attributes: ['id', 'nickname'] }],
    order: [['createdAt', 'ASC']],
  });
}

async function sendMessage(roomId, senderSessionId, senderParticipantId, content) {
  const room = await requireRoomMember(roomId, senderSessionId);
  const participant = await Participant.findOne({
    where: { id: senderParticipantId, tableSessionId: senderSessionId },
  });
  if (!participant) throw new AppError(403, 'PARTICIPANT_FORBIDDEN', 'Participant cannot send to this room.');
  if (!content || !content.trim()) throw new AppError(400, 'EMPTY_MESSAGE', 'Message content is required.');

  const message = await ChatMessage.create({
    roomId: room.id,
    senderParticipantId,
    content: content.trim(),
  });
  message.setDataValue('senderParticipant', { id: participant.id, nickname: participant.nickname });
  return message;
}

async function endRoom(roomId, user, reason = 'USER_ENDED') {
  return sequelize.transaction(async (transaction) => {
    const room = await ChatRoom.findByPk(roomId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!room) throw new AppError(404, 'CHAT_ROOM_NOT_FOUND', 'Chat room not found.');
    if (!participantCanUseRoom(room, user.sessionId)) {
      throw new AppError(403, 'CHAT_FORBIDDEN', 'No access to this chat room.');
    }
    if (room.status === 'CLOSED') return room;
    if (room.status !== 'ACTIVE') throw new AppError(409, 'CHAT_NOT_ACTIVE', 'Chat room is not active.');
    return room.update({
      status: 'CLOSED',
      endedAt: now(),
      endedByParticipantId: user.participantId || null,
      endReason: reason,
    }, { transaction });
  });
}

async function closeRoomsForSession(sessionId, reason, options = {}) {
  const rooms = await ChatRoom.findAll({
    where: {
      status: 'ACTIVE',
      [Op.or]: [{ requesterSessionId: sessionId }, { targetSessionId: sessionId }],
    },
    transaction: options.transaction,
    lock: options.transaction?.LOCK.UPDATE,
  });
  for (const room of rooms) {
    await room.update({
      status: 'CLOSED',
      endedAt: now(),
      endReason: reason,
    }, { transaction: options.transaction });
  }
  return rooms;
}

async function cancelPendingForSession(sessionId, options = {}) {
  const rooms = await ChatRoom.findAll({
    where: {
      status: 'PENDING',
      [Op.or]: [{ requesterSessionId: sessionId }, { targetSessionId: sessionId }],
    },
    transaction: options.transaction,
    lock: options.transaction?.LOCK.UPDATE,
  });
  for (const room of rooms) {
    await room.update({ status: 'CANCELLED', cancelledAt: now() }, { transaction: options.transaction });
  }
  return rooms;
}

async function adminListRooms(status = 'ACTIVE') {
  await expirePendingRooms();
  return ChatRoom.findAll({
    where: status ? { status } : undefined,
    include: [
      { model: TableSession, as: 'requesterSession', include: [{ model: Table, as: 'table', attributes: ['id', 'tableNumber'] }, { model: Participant, as: 'participants' }] },
      { model: TableSession, as: 'targetSession', include: [{ model: Table, as: 'table', attributes: ['id', 'tableNumber'] }, { model: Participant, as: 'participants' }] },
    ],
    order: [['updatedAt', 'DESC']],
  });
}

async function adminEndRoom(roomId) {
  return sequelize.transaction(async (transaction) => {
    const room = await ChatRoom.findByPk(roomId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!room) throw new AppError(404, 'CHAT_ROOM_NOT_FOUND', 'Chat room not found.');
    if (room.status === 'CLOSED') return room;
    if (room.status !== 'ACTIVE') throw new AppError(409, 'CHAT_NOT_ACTIVE', 'Chat room is not active.');
    return room.update({ status: 'CLOSED', endedAt: now(), endReason: 'ADMIN_ENDED' }, { transaction });
  });
}

module.exports = {
  createRequest,
  listRequests,
  acceptRequest,
  rejectRequest,
  cancelRequest,
  getActive,
  getMessages,
  sendMessage,
  endRoom,
  requireRoomMember,
  expirePendingRooms,
  closeRoomsForSession,
  cancelPendingForSession,
  adminListRooms,
  adminEndRoom,
  decorateRoom,
};
