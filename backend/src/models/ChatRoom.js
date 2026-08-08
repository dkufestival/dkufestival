// 두 테이블 세션 사이의 채팅방 모델
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const ChatRoom = sequelize.define(
  'ChatRoom',
  {
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
  }
);

module.exports = ChatRoom;
