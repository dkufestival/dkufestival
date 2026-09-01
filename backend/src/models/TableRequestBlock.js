const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const TableRequestBlock = sequelize.define(
  'TableRequestBlock',
  {
    blockerSessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    blockedSessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: 'table_request_blocks',
    indexes: [
      { unique: true, fields: ['blockerSessionId', 'blockedSessionId'] },
      { fields: ['blockedSessionId'] },
    ],
  }
);

module.exports = TableRequestBlock;
