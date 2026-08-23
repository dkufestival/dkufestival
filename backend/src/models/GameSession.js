const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const GameSession = sequelize.define(
  'GameSession',
  {
    mode: {
      type: DataTypes.ENUM('PAIR', 'GLOBAL'),
      allowNull: false,
      defaultValue: 'PAIR',
    },
    type: {
      type: DataTypes.ENUM('MISSION', 'OX_QUIZ', 'REACTION', 'RPS', 'TIME_MATCH'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'ACTIVE', 'ENDED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    initiatorSessionId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    targetSessionId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    state: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
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
    indexes: [
      { fields: ['initiatorSessionId'] },
      { fields: ['targetSessionId'] },
      { fields: ['status'] },
    ],
  }
);

module.exports = GameSession;
