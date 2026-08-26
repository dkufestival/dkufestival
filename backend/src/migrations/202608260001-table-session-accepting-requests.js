const { DataTypes } = require('sequelize');

module.exports = {
  async up({ queryInterface, transaction }) {
    await queryInterface.addColumn('table_sessions', 'acceptingRequests', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    }, { transaction });
  },

  async down({ queryInterface, transaction }) {
    await queryInterface.removeColumn('table_sessions', 'acceptingRequests', { transaction });
  },
};
