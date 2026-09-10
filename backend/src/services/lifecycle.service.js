const chatService = require('./chat.service');
const notificationService = require('./notification.service');
const { emitPublicTableUpdate, roomTableIds, sessionTableId } = require('../socket/table-updates');

async function closeSessionChats(sessionId, reason, options = {}) {
  const [closedRooms, cancelledRooms] = await Promise.all([
    chatService.closeRoomsForSession(sessionId, reason, options),
    chatService.cancelPendingForSession(sessionId, options),
  ]);
  return { closedRooms, cancelledRooms };
}

function emitLifecycle(io, result) {
  if (!io || !result) return;
  const sessionId = result.session?.id || result.id;
  const publicTableIds = [sessionTableId(result.session || result)];
  if (sessionId) io.to(`session:${sessionId}`).emit('table:checked-out', { session: result.session || result });
  for (const room of result.closedRooms || []) {
    io.to(`session:${room.requesterSessionId}`).to(`session:${room.targetSessionId}`).emit('chat:ended', room);
    io.in(`chat:${room.id}`).socketsLeave(`chat:${room.id}`);
    publicTableIds.push(...roomTableIds(room));
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
  for (const id of result.deletedPostIds || []) {
    io.to('participants').to('monitors').to('admins').emit('board:deleted', { id });
  }
  emitPublicTableUpdate(io, { tableIds: publicTableIds, reason: 'table:lifecycle-ended' });
}

module.exports = { closeSessionChats, emitLifecycle };
