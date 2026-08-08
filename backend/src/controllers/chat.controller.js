// 채팅 컨트롤러
const chatService = require('../services/chat.service');

async function createRoom(req, res, next) {
  try {
    const room = await chatService.createRoom(req.user.sessionId, req.body);
    res.status(201).json({ data: room });
  } catch (error) {
    next(error);
  }
}

async function getRooms(req, res, next) {
  try {
    const rooms = await chatService.getRooms(req.user.sessionId);
    res.json({ data: rooms });
  } catch (error) {
    next(error);
  }
}

async function getMessages(req, res, next) {
  try {
    const messages = await chatService.getMessages(req.params.roomId, req.user.sessionId);
    res.json({ data: messages });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createRoom,
  getRooms,
  getMessages,
};
