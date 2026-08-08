// 모델 내보내기와 기본 association 설정
const Table = require('./Table');
const TableSession = require('./TableSession');
const JoinRequest = require('./JoinRequest');
const ChatRoom = require('./ChatRoom');
const ChatMessage = require('./ChatMessage');
const GameSession = require('./GameSession');
const Notice = require('./Notice');

Table.hasMany(TableSession, { foreignKey: 'tableId', as: 'sessions' });
TableSession.belongsTo(Table, { foreignKey: 'tableId', as: 'table' });

TableSession.hasMany(JoinRequest, { foreignKey: 'fromSessionId', as: 'sentJoinRequests' });
TableSession.hasMany(JoinRequest, { foreignKey: 'targetSessionId', as: 'receivedJoinRequests' });
JoinRequest.belongsTo(TableSession, { foreignKey: 'fromSessionId', as: 'fromSession' });
JoinRequest.belongsTo(TableSession, { foreignKey: 'targetSessionId', as: 'targetSession' });

ChatRoom.hasMany(ChatMessage, { foreignKey: 'roomId', as: 'messages' });
ChatMessage.belongsTo(ChatRoom, { foreignKey: 'roomId', as: 'room' });
TableSession.hasMany(ChatRoom, { foreignKey: 'sessionAId', as: 'startedChatRooms' });
TableSession.hasMany(ChatRoom, { foreignKey: 'sessionBId', as: 'receivedChatRooms' });
ChatRoom.belongsTo(TableSession, { foreignKey: 'sessionAId', as: 'sessionA' });
ChatRoom.belongsTo(TableSession, { foreignKey: 'sessionBId', as: 'sessionB' });
TableSession.hasMany(ChatMessage, { foreignKey: 'senderSessionId', as: 'sentMessages' });
ChatMessage.belongsTo(TableSession, { foreignKey: 'senderSessionId', as: 'senderSession' });

TableSession.hasMany(GameSession, { foreignKey: 'initiatorSessionId', as: 'createdGames' });
TableSession.hasMany(GameSession, { foreignKey: 'targetSessionId', as: 'receivedGames' });
GameSession.belongsTo(TableSession, { foreignKey: 'initiatorSessionId', as: 'initiator' });
GameSession.belongsTo(TableSession, { foreignKey: 'targetSessionId', as: 'target' });

module.exports = {
  Table,
  TableSession,
  JoinRequest,
  ChatRoom,
  ChatMessage,
  GameSession,
  Notice,
};
