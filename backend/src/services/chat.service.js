const { Op } = require('sequelize');
const { ChatRoom, ChatMessage, TableSession, Participant } = require('../models');
const AppError = require('../errors/AppError');

async function requireActiveSession(sessionId) {
  const session = await TableSession.findOne({ where: { id: sessionId, status: 'ACTIVE' } });
  if (!session || new Date(session.expiresAt) <= new Date()) {
    throw new AppError(404, 'SESSION_NOT_FOUND', 'Active table session not found.');
  }
  return session;
}

async function requireRoomMember(roomId, sessionId) {
  const room = await ChatRoom.findOne({
    where: {
      id: roomId,
      [Op.or]: [{ sessionAId: sessionId }, { sessionBId: sessionId }],
    },
  });
  if (!room) throw new AppError(403, 'CHAT_FORBIDDEN', 'No access to this chat room.');
  return room;
}

async function createRoom(sessionId, data, options = {}) {
  const targetSessionId = Number(data.targetSessionId);
  if (Number(sessionId) === targetSessionId) {
    throw new AppError(400, 'INVALID_CHAT_TARGET', 'Cannot create a chat room with the same session.');
  }
  await Promise.all([requireActiveSession(sessionId), requireActiveSession(targetSessionId)]);

  const [sessionAId, sessionBId] = [Number(sessionId), targetSessionId].sort((a, b) => a - b);
  const [room] = await ChatRoom.findOrCreate({
    where: { sessionAId, sessionBId },
    transaction: options.transaction,
  });
  return room;
}

async function getRooms(sessionId) {
  return ChatRoom.findAll({
    where: { [Op.or]: [{ sessionAId: sessionId }, { sessionBId: sessionId }] },
    order: [['updatedAt', 'DESC']],
  });
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
  await requireRoomMember(roomId, senderSessionId);
  const participant = await Participant.findOne({
    where: { id: senderParticipantId, tableSessionId: senderSessionId },
  });
  if (!participant) throw new AppError(403, 'PARTICIPANT_FORBIDDEN', 'Participant cannot send to this room.');
  if (!content || !content.trim()) throw new AppError(400, 'EMPTY_MESSAGE', 'Message content is required.');

  const message = await ChatMessage.create({
    roomId,
    senderParticipantId,
    content: content.trim(),
  });
  message.setDataValue('senderParticipant', { id: participant.id, nickname: participant.nickname });
  return message;
}

module.exports = { createRoom, getRooms, getMessages, sendMessage, requireRoomMember };
