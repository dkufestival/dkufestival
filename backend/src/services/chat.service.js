const { Op } = require('sequelize');
const { ChatRoom, ChatMessage, TableSession } = require('../models');
const AppError = require('../errors/AppError');

async function requireActiveSession(sessionId) {
  const session = await TableSession.findOne({ where: { id: sessionId, status: 'ACTIVE' } });
  if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', '활성 좌석 세션을 찾을 수 없습니다.');
  return session;
}

async function requireRoomMember(roomId, sessionId) {
  const room = await ChatRoom.findOne({
    where: {
      id: roomId,
      [Op.or]: [{ sessionAId: sessionId }, { sessionBId: sessionId }],
    },
  });
  if (!room) throw new AppError(403, 'CHAT_FORBIDDEN', '해당 채팅방에 접근할 수 없습니다.');
  return room;
}

async function createRoom(sessionId, data) {
  const targetSessionId = Number(data.targetSessionId);
  if (Number(sessionId) === targetSessionId) {
    throw new AppError(400, 'INVALID_CHAT_TARGET', '자기 좌석과 채팅방을 만들 수 없습니다.');
  }
  await Promise.all([requireActiveSession(sessionId), requireActiveSession(targetSessionId)]);

  const [sessionAId, sessionBId] = [Number(sessionId), targetSessionId].sort((a, b) => a - b);
  const [room] = await ChatRoom.findOrCreate({ where: { sessionAId, sessionBId } });
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
  return ChatMessage.findAll({ where: { roomId }, order: [['createdAt', 'ASC']] });
}

async function sendMessage(roomId, senderSessionId, content) {
  await requireRoomMember(roomId, senderSessionId);
  if (!content || !content.trim()) throw new AppError(400, 'EMPTY_MESSAGE', '메시지를 입력해주세요.');
  return ChatMessage.create({ roomId, senderSessionId, content: content.trim() });
}

module.exports = { createRoom, getRooms, getMessages, sendMessage, requireRoomMember };
