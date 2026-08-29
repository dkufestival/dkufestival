const { DataTypes } = require('sequelize');

module.exports = {
  async up({ queryInterface, transaction }) {
    const table = await queryInterface.describeTable('table_sessions');

    if (table.acceptingRequests) {
      return;
    }

    await queryInterface.addColumn(
      'table_sessions',
      'acceptingRequests',
      {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      { transaction }
    );
  },

  async down({ queryInterface, transaction }) {
    const table = await queryInterface.describeTable('table_sessions');

    if (!table.acceptingRequests) {
      return;
    }

    await queryInterface.removeColumn(
      'table_sessions',
      'acceptingRequests',
      { transaction }
    );
  },
};