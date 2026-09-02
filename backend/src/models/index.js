// 모델 내보내기와 기본 association 설정
const Table = require('./Table');
const TableSession = require('./TableSession');
const ChatRoom = require('./ChatRoom');
const ChatMessage = require('./ChatMessage');
const GameSession = require('./GameSession');
const Notice = require('./Notice');
const Participant = require('./Participant');
const GlobalChatMessage = require('./GlobalChatMessage');
const BoardPost = require('./BoardPost');
const PushSubscription = require('./PushSubscription');
const TableRequestBlock = require('./TableRequestBlock');
const BasketballScore = require('./BasketballScore');
const TableLike = require('./TableLike');
const StaffCall = require('./StaffCall');
const BoardProfile = require('./BoardProfile');
const BoardProfileView = require('./BoardProfileView');

Table.hasMany(TableSession, { foreignKey: 'tableId', as: 'sessions', constraints: false });
TableSession.belongsTo(Table, { foreignKey: 'tableId', as: 'table', constraints: false });
TableSession.hasMany(Participant, { foreignKey: 'tableSessionId', as: 'participants', constraints: false });
Participant.belongsTo(TableSession, { foreignKey: 'tableSessionId', as: 'session', constraints: false });

ChatRoom.hasMany(ChatMessage, { foreignKey: 'roomId', as: 'messages', constraints: false });
ChatMessage.belongsTo(ChatRoom, { foreignKey: 'roomId', as: 'room', constraints: false });
TableSession.hasMany(ChatRoom, { foreignKey: 'requesterSessionId', as: 'sentChatRequests', constraints: false });
TableSession.hasMany(ChatRoom, { foreignKey: 'targetSessionId', as: 'receivedChatRequests', constraints: false });
ChatRoom.belongsTo(TableSession, { foreignKey: 'requesterSessionId', as: 'requesterSession', constraints: false });
ChatRoom.belongsTo(TableSession, { foreignKey: 'targetSessionId', as: 'targetSession', constraints: false });
Participant.hasMany(ChatRoom, { foreignKey: 'requestedByParticipantId', as: 'requestedChatRooms', constraints: false });
Participant.hasMany(ChatRoom, { foreignKey: 'endedByParticipantId', as: 'endedChatRooms', constraints: false });
ChatRoom.belongsTo(Participant, { foreignKey: 'requestedByParticipantId', as: 'requestedByParticipant', constraints: false });
ChatRoom.belongsTo(Participant, { foreignKey: 'endedByParticipantId', as: 'endedByParticipant', constraints: false });
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
Participant.hasMany(PushSubscription, { foreignKey: 'participantId', as: 'pushSubscriptions', constraints: false });
PushSubscription.belongsTo(Participant, { foreignKey: 'participantId', as: 'participant', constraints: false });

TableSession.hasMany(TableRequestBlock, { foreignKey: 'blockerSessionId', as: 'requestBlocks', constraints: false });
TableSession.hasMany(TableRequestBlock, { foreignKey: 'blockedSessionId', as: 'blockedBySessions', constraints: false });
TableRequestBlock.belongsTo(TableSession, { foreignKey: 'blockerSessionId', as: 'blockerSession', constraints: false });
TableRequestBlock.belongsTo(TableSession, { foreignKey: 'blockedSessionId', as: 'blockedSession', constraints: false });

TableSession.hasMany(GameSession, { foreignKey: 'initiatorSessionId', as: 'createdGames', constraints: false });
TableSession.hasMany(GameSession, { foreignKey: 'targetSessionId', as: 'receivedGames', constraints: false });
GameSession.belongsTo(TableSession, { foreignKey: 'initiatorSessionId', as: 'initiator', constraints: false });
GameSession.belongsTo(TableSession, { foreignKey: 'targetSessionId', as: 'target', constraints: false });

Participant.hasOne(BasketballScore, { foreignKey: 'participantId', as: 'basketballScore', constraints: false });
BasketballScore.belongsTo(Participant, { foreignKey: 'participantId', as: 'participant', constraints: false });
TableSession.hasMany(BasketballScore, { foreignKey: 'tableSessionId', as: 'basketballScores', constraints: false });
BasketballScore.belongsTo(TableSession, { foreignKey: 'tableSessionId', as: 'tableSession', constraints: false });

Participant.hasMany(GlobalChatMessage, { foreignKey: 'senderParticipantId', as: 'globalChatMessages', constraints: false });
GlobalChatMessage.belongsTo(Participant, { foreignKey: 'senderParticipantId', as: 'senderParticipant', constraints: false });

Participant.hasMany(BoardPost, { foreignKey: 'authorParticipantId', as: 'boardPosts', constraints: false });
BoardPost.belongsTo(Participant, { foreignKey: 'authorParticipantId', as: 'author', constraints: false });

TableSession.hasMany(TableLike, { foreignKey: 'fromSessionId', as: 'givenLikes', constraints: false });
TableSession.hasMany(TableLike, { foreignKey: 'toSessionId', as: 'receivedLikes', constraints: false });
TableLike.belongsTo(TableSession, { foreignKey: 'fromSessionId', as: 'fromSession', constraints: false });
TableLike.belongsTo(TableSession, { foreignKey: 'toSessionId', as: 'toSession', constraints: false });

TableSession.hasMany(StaffCall, { foreignKey: 'tableSessionId', as: 'staffCalls', constraints: false });
StaffCall.belongsTo(TableSession, { foreignKey: 'tableSessionId', as: 'session', constraints: false });

Participant.hasOne(BoardProfile, { foreignKey: 'participantId', as: 'boardProfile', constraints: false });
BoardProfile.belongsTo(Participant, { foreignKey: 'participantId', as: 'participant', constraints: false });
BoardProfile.hasMany(BoardPost, { sourceKey: 'participantId', foreignKey: 'authorParticipantId', as: 'posts', constraints: false });
BoardPost.belongsTo(BoardProfile, { targetKey: 'participantId', foreignKey: 'authorParticipantId', as: 'authorProfile', constraints: false });
Participant.hasMany(BoardProfileView, { foreignKey: 'viewerParticipantId', as: 'profileViewsMade', constraints: false });
Participant.hasMany(BoardProfileView, { foreignKey: 'viewedParticipantId', as: 'profileViewsReceived', constraints: false });
BoardProfileView.belongsTo(Participant, { foreignKey: 'viewerParticipantId', as: 'viewer', constraints: false });
BoardProfileView.belongsTo(Participant, { foreignKey: 'viewedParticipantId', as: 'viewed', constraints: false });
BoardProfileView.belongsTo(BoardPost, { foreignKey: 'sourcePostId', as: 'sourcePost', constraints: false });

module.exports = {
  Table,
  TableSession,
  ChatRoom,
  ChatMessage,
  GameSession,
  Notice,
  Participant,
  GlobalChatMessage,
  BoardPost,
  PushSubscription,
  TableRequestBlock,
  BasketballScore,
  TableLike,
  StaffCall,
  BoardProfile,
  BoardProfileView,
};
