const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const BoardProfileView = sequelize.define(
  'BoardProfileView',
  {
    viewerParticipantId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    viewedParticipantId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    sourcePostId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    sourcePostTitle: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
  },
  {
    tableName: 'board_profile_views',
    indexes: [
      { unique: true, fields: ['viewerParticipantId', 'viewedParticipantId'] },
      { fields: ['viewedParticipantId'] },
    ],
  }
);

module.exports = BoardProfileView;
