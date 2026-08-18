const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const SongRequest = sequelize.define(
  'SongRequest',
  {
    tableSessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    participantId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    songTitle: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    artist: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('REQUESTED', 'CANCELLED', 'COMPLETED'),
      allowNull: false,
      defaultValue: 'REQUESTED',
    },
  },
  {
    tableName: 'song_requests',
    indexes: [
      { fields: ['tableSessionId'] },
      { fields: ['participantId'] },
      { fields: ['status'] },
    ],
  }
);

module.exports = SongRequest;
