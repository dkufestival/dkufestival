const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

module.exports = sequelize.define('ServiceStat', {
  id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
  totalUniqueParticipants: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
  totalSessions: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
  totalHttpRequests: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
  totalSocketConnections: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
  peakSocketConnections: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  peakConcurrentParticipants: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
}, { tableName: 'service_stats' });
