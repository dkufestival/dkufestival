const { Op } = require('sequelize');
const sequelize = require('../config/db');
const { TableSession } = require('../models');
const chatService = require('./chat.service');
const notificationService = require('./notification.service');

async function closeSessionChats(sessionId, reason, options = {}) {
  const [closedRooms, cancelledRooms] = await Promise.all([
    chatService.closeRoomsForSession(sessionId, reason, options),
    chatService.cancelPendingForSession(sessionId, options),
  ]);
  return { closedRooms, cancelledRooms };
}

async function expireSessions(options = {}) {
  const at = options.now || new Date();
  return sequelize.transaction(async (transaction) => {
    const sessions = await TableSession.findAll({
      where: {
        status: 'ACTIVE',
        expiresAt: { [Op.lte]: at },
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const results = [];
    for (const session of sessions) {
      await session.update({ status: 'CLOSED', endedAt: at }, { transaction });
      const chats = await closeSessionChats(session.id, 'SESSION_EXPIRED', { transaction });
      results.push({ session, ...chats });
    }
    await chatService.expirePendingRooms({ transaction, now: at });
    return results;
  });
}

function emitLifecycle(io, result) {
  if (!io || !result) return;
  const sessionId = result.session?.id || result.id;
  if (sessionId) io.to(`session:${sessionId}`).emit('table:checked-out', { session: result.session || result });
  for (const room of result.closedRooms || []) {
    io.to(`session:${room.requesterSessionId}`).to(`session:${room.targetSessionId}`).emit('chat:ended', room);
    io.in(`chat:${room.id}`).socketsLeave(`chat:${room.id}`);
    notificationService.notifySessions([room.requesterSessionId, room.targetSessionId], {
      title: '채팅 종료',
      body: '테이블 세션 종료로 채팅이 종료되었습니다.',
      roomId: room.id,
      type: 'CHAT_ENDED',
    }).catch(() => {});
  }
  for (const room of result.cancelledRooms || []) {
    io.to(`session:${room.requesterSessionId}`).to(`session:${room.targetSessionId}`).emit('chat:request-cancelled', room);
  }
}

module.exports = { closeSessionChats, expireSessions, emitLifecycle };
