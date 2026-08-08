// 1:1 게임과 전체 참여 게임을 위한 게임 세션 기본 모델
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const GameSession = sequelize.define(
  'GameSession',
  {
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'GLOBAL',
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'ACTIVE', 'ENDED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    state: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'game_sessions',
  }
);

module.exports = GameSession;
