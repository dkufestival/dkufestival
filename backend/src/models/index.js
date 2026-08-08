// 모델 내보내기와 기본 association 설정
const Table = require('./Table');
const TableSession = require('./TableSession');
const JoinRequest = require('./JoinRequest');
const ChatRoom = require('./ChatRoom');
const ChatMessage = require('./ChatMessage');
const GameSession = require('./GameSession');

Table.hasMany(TableSession, { foreignKey: 'tableId', as: 'sessions' });
TableSession.belongsTo(Table, { foreignKey: 'tableId', as: 'table' });

TableSession.hasMany(JoinRequest, { foreignKey: 'fromSessionId', as: 'sentJoinRequests' });
TableSession.hasMany(JoinRequest, { foreignKey: 'targetSessionId', as: 'receivedJoinRequests' });
JoinRequest.belongsTo(TableSession, { foreignKey: 'fromSessionId', as: 'fromSession' });
JoinRequest.belongsTo(TableSession, { foreignKey: 'targetSessionId', as: 'targetSession' });

ChatRoom.hasMany(ChatMessage, { foreignKey: 'roomId', as: 'messages' });
ChatMessage.belongsTo(ChatRoom, { foreignKey: 'roomId', as: 'room' });

module.exports = {
  Table,
  TableSession,
  JoinRequest,
  ChatRoom,
  ChatMessage,
  GameSession,
};
