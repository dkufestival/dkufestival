const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

module.exports = sequelize.define('TrafficSnapshot', {
  recordedAt: { type: DataTypes.DATE, allowNull: false },
  concurrentSocketConnections: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  concurrentParticipants: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  totalHttpRequests: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  totalSocketConnections: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
}, { tableName: 'traffic_snapshots', indexes: [{ fields: ['recordedAt'] }] });
