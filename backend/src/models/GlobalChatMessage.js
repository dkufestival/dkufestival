// 전체채팅(모든 참가자 + 관리자) 메시지 모델
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const GlobalChatMessage = sequelize.define(
  'GlobalChatMessage',
  {
    senderParticipantId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    senderRole: {
      type: DataTypes.ENUM('PARTICIPANT', 'ADMIN'),
      allowNull: false,
      defaultValue: 'PARTICIPANT',
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'global_chat_messages',
    updatedAt: false,
    indexes: [{ fields: ['createdAt'] }],
  }
);

module.exports = GlobalChatMessage;
