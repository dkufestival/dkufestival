const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const GameSession = sequelize.define(
  'GameSession',
  {
    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'ACTIVE', 'ENDED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    initiatorSessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    targetSessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
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
