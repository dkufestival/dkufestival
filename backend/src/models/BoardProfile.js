const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const BoardProfile = sequelize.define(
  'BoardProfile',
  {
    participantId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },
    gender: {
      type: DataTypes.ENUM('MALE', 'FEMALE'),
      allowNull: false,
    },
    instagramId: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
  },
  {
    tableName: 'board_profiles',
    indexes: [
      { unique: true, fields: ['participantId'] },
    ],
  }
);

module.exports = BoardProfile;
