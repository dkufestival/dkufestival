const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Notice = sequelize.define('Notice', {
  title: { type: DataTypes.STRING(150), allowNull: false },
  content: { type: DataTypes.TEXT, allowNull: false },
  category: {
    type: DataTypes.ENUM('GENERAL', 'GAME', 'EVENT', 'OPERATION'),
    allowNull: false,
    defaultValue: 'GENERAL',
  },
}, {
  tableName: 'notices',
  indexes: [{ fields: ['createdAt'] }],
});

module.exports = Notice;
