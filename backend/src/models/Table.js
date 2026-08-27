// 실제 물리 테이블 모델
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Table = sequelize.define(
  'Table',
  {
    tableNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },
    qrToken: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    qrEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    qrVersion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
  },
  {
    tableName: 'tables',
  }
);

module.exports = Table;
