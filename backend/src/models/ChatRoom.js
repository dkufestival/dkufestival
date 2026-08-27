const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const ChatRoom = sequelize.define(
  'ChatRoom',
  {
    requesterSessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    targetSessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    requestedByParticipantId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    requestMessage: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'ACTIVE', 'REJECTED', 'CANCELLED', 'EXPIRED', 'CLOSED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    requestExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    acceptedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    rejectedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    endedByParticipantId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    endReason: {
      type: DataTypes.ENUM('USER_ENDED', 'ADMIN_ENDED', 'SESSION_CHECKED_OUT', 'SESSION_EXPIRED'),
      allowNull: true,
    },
    sessionAId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    sessionBId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: 'chat_rooms',
    indexes: [
      { fields: ['status', 'requestExpiresAt'] },
      { fields: ['requesterSessionId', 'status'] },
      { fields: ['targetSessionId', 'status'] },
      { fields: ['sessionAId'] },
      { fields: ['sessionBId'] },
    ],
  }
);

module.exports = ChatRoom;
