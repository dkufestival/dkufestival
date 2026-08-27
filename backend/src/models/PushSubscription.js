const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const PushSubscription = sequelize.define(
  'PushSubscription',
  {
    participantId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    endpoint: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    endpointHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    p256dh: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    auth: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    userAgent: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
  },
  {
    tableName: 'push_subscriptions',
    indexes: [
      { fields: ['participantId'] },
      { unique: true, fields: ['endpointHash'] },
    ],
  }
);

module.exports = PushSubscription;
