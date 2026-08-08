// 채팅 비즈니스 로직
const { ChatRoom, ChatMessage } = require('../models');

async function createRoom(sessionId, data) {
  // TODO: 같은 두 활성 세션 사이에 채팅방이 중복 생성되지 않게 한다.
  return ChatRoom.create({
    sessionAId: sessionId,
    sessionBId: data.targetSessionId,
  });
}

async function getRooms(sessionId) {
  // TODO: sessionId가 참여자인 채팅방만 반환한다.
  return ChatRoom.findAll();
}

async function getMessages(roomId, sessionId) {
  // TODO: 메시지 반환 전에 sessionId가 해당 채팅방 참여자인지 검증한다.
  return ChatMessage.findAll({
    where: { roomId },
    order: [['createdAt', 'ASC']],
  });
}

async function sendMessage(roomId, senderSessionId, content) {
  // TODO: senderSessionId가 해당 채팅방 참여자인지 검증한다.
  return ChatMessage.create({
    roomId,
    senderSessionId,
    content,
  });
}

module.exports = {
  createRoom,
  getRooms,
  getMessages,
  sendMessage,
};
