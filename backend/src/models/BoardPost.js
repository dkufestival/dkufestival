// 참가자 자유게시판 글 모델
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const BoardPost = sequelize.define(
  'BoardPost',
  {
    authorParticipantId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'board_posts',
    updatedAt: false,
    indexes: [{ fields: ['createdAt'] }],
  }
);

module.exports = BoardPost;
