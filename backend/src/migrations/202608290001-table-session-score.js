const { DataTypes } = require('sequelize');

module.exports = {
  async up({ queryInterface, transaction }) {
    const columns = await queryInterface.describeTable('table_sessions');
    if (columns.score) return;
    await queryInterface.addColumn('table_sessions', 'score', {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    }, { transaction });
  },

  async down({ queryInterface, transaction }) {
    const columns = await queryInterface.describeTable('table_sessions');
    if (!columns.score) return;
    await queryInterface.removeColumn('table_sessions', 'score', { transaction });
  },
};
