const { DataTypes } = require('sequelize');

module.exports = {
  async up({ queryInterface, transaction }) {
    await queryInterface.addColumn('table_sessions', 'score', {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    }, { transaction });
  },

  async down({ queryInterface, transaction }) {
    await queryInterface.removeColumn('table_sessions', 'score', { transaction });
  },
};
