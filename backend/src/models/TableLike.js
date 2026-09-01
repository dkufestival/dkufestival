// 테이블 좋아요 (호스트가 다른 테이블에 누르는 좋아요)
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const TableLike = sequelize.define(
  'TableLike',
  {
    fromSessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    toSessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: 'table_likes',
    indexes: [
      { unique: true, fields: ['fromSessionId', 'toSessionId'] },
      { fields: ['toSessionId'] },
    ],
  }
);

module.exports = TableLike;
