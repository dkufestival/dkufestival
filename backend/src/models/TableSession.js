// 물리 테이블을 사용하는 팀의 활성/종료 세션 모델
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const TableSession = sequelize.define(
  'TableSession',
  {
    tableId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    nickname: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    memberCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    genderType: {
      type: DataTypes.ENUM('MALE', 'FEMALE', 'MIXED'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'CLOSED'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'table_sessions',
  }
);

module.exports = TableSession;
