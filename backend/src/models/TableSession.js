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
      allowNull: true,
    },
    memberCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    genderType: {
      type: DataTypes.ENUM('MALE', 'FEMALE', 'MIXED'),
      allowNull: true,
    },
    maleCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    femaleCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
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
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
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
