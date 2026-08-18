// 모델 내보내기와 기본 association 설정
const Table = require('./Table');
const TableSession = require('./TableSession');
const JoinRequest = require('./JoinRequest');
const ChatRoom = require('./ChatRoom');
const ChatMessage = require('./ChatMessage');
const GameSession = require('./GameSession');
const Notice = require('./Notice');
const Participant = require('./Participant');
const SongRequest = require('./SongRequest');

Table.hasMany(TableSession, { foreignKey: 'tableId', as: 'sessions', constraints: false });
TableSession.belongsTo(Table, { foreignKey: 'tableId', as: 'table', constraints: false });
TableSession.hasMany(Participant, { foreignKey: 'tableSessionId', as: 'participants', constraints: false });
Participant.belongsTo(TableSession, { foreignKey: 'tableSessionId', as: 'session', constraints: false });

TableSession.hasMany(JoinRequest, { foreignKey: 'fromSessionId', as: 'sentJoinRequests', constraints: false });
TableSession.hasMany(JoinRequest, { foreignKey: 'targetSessionId', as: 'receivedJoinRequests', constraints: false });
JoinRequest.belongsTo(TableSession, { foreignKey: 'fromSessionId', as: 'fromSession', constraints: false });
JoinRequest.belongsTo(TableSession, { foreignKey: 'targetSessionId', as: 'targetSession', constraints: false });

ChatRoom.hasMany(ChatMessage, { foreignKey: 'roomId', as: 'messages', constraints: false });
ChatMessage.belongsTo(ChatRoom, { foreignKey: 'roomId', as: 'room', constraints: false });
TableSession.hasMany(ChatRoom, { foreignKey: 'sessionAId', as: 'startedChatRooms', constraints: false });
TableSession.hasMany(ChatRoom, { foreignKey: 'sessionBId', as: 'receivedChatRooms', constraints: false });
ChatRoom.belongsTo(TableSession, { foreignKey: 'sessionAId', as: 'sessionA', constraints: false });
ChatRoom.belongsTo(TableSession, { foreignKey: 'sessionBId', as: 'sessionB', constraints: false });
TableSession.hasMany(ChatMessage, {
  foreignKey: 'senderSessionId',
  as: 'legacySentMessages',
  constraints: false,
});
ChatMessage.belongsTo(TableSession, {
  foreignKey: 'senderSessionId',
  as: 'senderSession',
  constraints: false,
});
Participant.hasMany(ChatMessage, { foreignKey: 'senderParticipantId', as: 'sentMessages', constraints: false });
ChatMessage.belongsTo(Participant, { foreignKey: 'senderParticipantId', as: 'senderParticipant', constraints: false });

TableSession.hasMany(GameSession, { foreignKey: 'initiatorSessionId', as: 'createdGames', constraints: false });
TableSession.hasMany(GameSession, { foreignKey: 'targetSessionId', as: 'receivedGames', constraints: false });
GameSession.belongsTo(TableSession, { foreignKey: 'initiatorSessionId', as: 'initiator', constraints: false });
GameSession.belongsTo(TableSession, { foreignKey: 'targetSessionId', as: 'target', constraints: false });

TableSession.hasMany(SongRequest, { foreignKey: 'tableSessionId', as: 'songRequests', constraints: false });
SongRequest.belongsTo(TableSession, { foreignKey: 'tableSessionId', as: 'session', constraints: false });
Participant.hasMany(SongRequest, { foreignKey: 'participantId', as: 'songRequests', constraints: false });
SongRequest.belongsTo(Participant, { foreignKey: 'participantId', as: 'participant', constraints: false });

module.exports = {
  Table,
  TableSession,
  JoinRequest,
  ChatRoom,
  ChatMessage,
  GameSession,
  Notice,
  Participant,
  SongRequest,
};
