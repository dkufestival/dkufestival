// 채팅방 안의 메시지 모델
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const ChatMessage = sequelize.define(
  'ChatMessage',
  {
    roomId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    senderSessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
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
    tableName: 'chat_messages',
    updatedAt: false,
  }
);

module.exports = ChatMessage;
