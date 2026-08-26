const chatService = require('../services/chat.service');
const notificationService = require('../services/notification.service');

function sessionRooms(room) {
  return [`session:${room.requesterSessionId}`, `session:${room.targetSessionId}`];
}

function emitToRoomParties(io, room, event, payload) {
  if (!io || !room) return;
  io.to(sessionRooms(room)[0]).to(sessionRooms(room)[1]).emit(event, payload);
}

async function createRequest(req, res, next) {
  try {
    const created = await chatService.createRequest(req.user, req.body);
    const room = await chatService.decorateRoom(created, req.user.sessionId);
    const requesterView = await chatService.decorateRoom(created, created.requesterSessionId);
    const targetView = await chatService.decorateRoom(created, created.targetSessionId);
    const io = req.app.get('io');
    if (io) {
      io.to(`session:${created.requesterSessionId}`).emit('chat:request-received', requesterView);
      io.to(`session:${created.targetSessionId}`).emit('chat:request-received', targetView);
    }
    emitToRoomParties(io, room, 'notification:created', {
      type: 'CHAT_REQUEST',
      roomId: room.id,
      message: '새 채팅 요청이 도착했습니다.',
    });
    notificationService.notifySessions([room.targetSessionId], {
      title: '채팅 요청',
      body: '새 채팅 요청이 도착했습니다.',
      roomId: room.id,
      type: 'CHAT_REQUEST',
    }).catch(() => {});
    res.status(201).json({ data: room });
  } catch (error) {
    next(error);
  }
}

async function listRequests(req, res, next) {
  try {
    const rooms = await chatService.listRequests(req.user.sessionId, req.query);
    res.json({ data: rooms });
  } catch (error) {
    next(error);
  }
}

async function acceptRequest(req, res, next) {
  try {
    const accepted = await chatService.acceptRequest(req.params.roomId, req.user);
    const room = await chatService.decorateRoom(accepted, req.user.sessionId);
    const requesterView = await chatService.decorateRoom(accepted, accepted.requesterSessionId);
    const targetView = await chatService.decorateRoom(accepted, accepted.targetSessionId);
    const io = req.app.get('io');
    if (io) {
      io.in(sessionRooms(room)).socketsJoin(`chat:${room.id}`);
      io.to(`session:${accepted.requesterSessionId}`).emit('chat:started', requesterView);
      io.to(`session:${accepted.targetSessionId}`).emit('chat:started', targetView);
      io.to(`session:${accepted.requesterSessionId}`).emit('chat:active', requesterView);
      io.to(`session:${accepted.targetSessionId}`).emit('chat:active', targetView);
      emitToRoomParties(io, room, 'notification:created', {
        type: 'CHAT_STARTED',
        roomId: room.id,
        message: '채팅이 시작되었습니다.',
      });
    }
    notificationService.notifySessions([room.requesterSessionId, room.targetSessionId], {
      title: '채팅 시작',
      body: '채팅이 시작되었습니다.',
      roomId: room.id,
      type: 'CHAT_STARTED',
    }).catch(() => {});
    res.json({ data: room });
  } catch (error) {
    next(error);
  }
}

async function rejectRequest(req, res, next) {
  try {
    const rejected = await chatService.rejectRequest(req.params.roomId, req.user);
    const room = await chatService.decorateRoom(rejected, req.user.sessionId);
    emitToRoomParties(req.app.get('io'), room, 'chat:request-rejected', room);
    notificationService.notifySessions([room.requesterSessionId], {
      title: '채팅 요청 거절',
      body: '채팅 요청이 거절되었습니다.',
      roomId: room.id,
      type: 'CHAT_REJECTED',
    }).catch(() => {});
    res.json({ data: room });
  } catch (error) {
    next(error);
  }
}

async function cancelRequest(req, res, next) {
  try {
    const cancelled = await chatService.cancelRequest(req.params.roomId, req.user);
    const room = await chatService.decorateRoom(cancelled, req.user.sessionId);
    emitToRoomParties(req.app.get('io'), room, 'chat:request-cancelled', room);
    notificationService.notifySessions([room.targetSessionId], {
      title: '채팅 요청 취소',
      body: '채팅 요청이 취소되었습니다.',
      roomId: room.id,
      type: 'CHAT_CANCELLED',
    }).catch(() => {});
    res.json({ data: room });
  } catch (error) {
    next(error);
  }
}

async function getActive(req, res, next) {
  try {
    const room = await chatService.getActive(req.user.sessionId);
    res.json({ data: room });
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

async function endRoom(req, res, next) {
  try {
    const ended = await chatService.endRoom(req.params.roomId, req.user);
    const room = await chatService.decorateRoom(ended, req.user.sessionId);
    const io = req.app.get('io');
    if (io) {
      emitToRoomParties(io, room, 'chat:ended', room);
      io.in(`chat:${room.id}`).socketsLeave(`chat:${room.id}`);
    }
    notificationService.notifySessions([room.requesterSessionId, room.targetSessionId], {
      title: '채팅 종료',
      body: '채팅이 종료되었습니다.',
      roomId: room.id,
      type: 'CHAT_ENDED',
    }).catch(() => {});
    res.json({ data: room });
  } catch (error) {
    next(error);
  }
}

async function adminListRooms(req, res, next) {
  try {
    const rooms = await chatService.adminListRooms(req.query.status || 'ACTIVE');
    res.json({ data: rooms });
  } catch (error) {
    next(error);
  }
}

async function adminEndRoom(req, res, next) {
  try {
    const ended = await chatService.adminEndRoom(req.params.roomId);
    const room = await chatService.decorateRoom(ended, ended.requesterSessionId);
    const io = req.app.get('io');
    if (io) {
      emitToRoomParties(io, room, 'chat:ended', room);
      io.in(`chat:${room.id}`).socketsLeave(`chat:${room.id}`);
    }
    notificationService.notifySessions([room.requesterSessionId, room.targetSessionId], {
      title: '채팅 강제 종료',
      body: '관리자가 채팅을 종료했습니다.',
      roomId: room.id,
      type: 'CHAT_ENDED',
    }).catch(() => {});
    res.json({ data: room });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createRequest,
  listRequests,
  acceptRequest,
  rejectRequest,
  cancelRequest,
  getActive,
  getMessages,
  endRoom,
  adminListRooms,
  adminEndRoom,
};
