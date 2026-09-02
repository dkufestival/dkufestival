const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Participant = sequelize.define(
  'Participant',
  {
    tableSessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    clientId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    nickname: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    gender: { type: DataTypes.ENUM('MALE', 'FEMALE'), allowNull: true },
    isHost: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    kickedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    kickedReason: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    blockedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    blockedReason: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: 'participants',
    indexes: [
      { unique: true, fields: ['tableSessionId', 'clientId'] },
      { fields: ['tableSessionId'] },
      { fields: ['clientId', 'kickedAt'] },
      { fields: ['clientId', 'blockedAt'] },
    ],
  }
);

module.exports = Participant;
