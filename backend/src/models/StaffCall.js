// 직원 호출
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const StaffCall = sequelize.define(
  'StaffCall',
  {
    tableSessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'RESOLVED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'staff_calls',
    indexes: [{ fields: ['tableSessionId', 'status'] }],
  }
);

module.exports = StaffCall;
