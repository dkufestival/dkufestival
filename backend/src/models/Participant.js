const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Participant = sequelize.define(
  'Participant',
  {
    tableSessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    clientId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    nickname: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    isHost: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    tableName: 'participants',
    indexes: [
      { unique: true, fields: ['tableSessionId', 'clientId'] },
      { fields: ['tableSessionId'] },
    ],
  }
);

module.exports = Participant;
