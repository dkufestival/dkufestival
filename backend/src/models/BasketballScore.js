const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const BasketballScore = sequelize.define(
  'BasketballScore',
  {
    participantId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    tableSessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    bestScore: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      validate: { min: 1 },
    },
    achievedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'basketball_scores',
    indexes: [
      { unique: true, fields: ['participantId', 'tableSessionId'] },
      { fields: ['bestScore', 'achievedAt'] },
      { fields: ['tableSessionId'] },
    ],
  }
);

module.exports = BasketballScore;
