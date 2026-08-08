// 한 테이블 세션이 다른 테이블 세션에 보내는 합석 요청 모델
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const JoinRequest = sequelize.define(
  'JoinRequest',
  {
    fromSessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    targetSessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    message: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'ACCEPTED', 'REJECTED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
  },
  {
    tableName: 'join_requests',
  }
);

module.exports = JoinRequest;
