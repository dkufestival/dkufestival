const { DataTypes } = require('sequelize');

module.exports = {
  async up({ queryInterface, transaction }) {
    const table = await queryInterface.describeTable('board_posts');
    if (!table.details) await queryInterface.addColumn('board_posts', 'details', { type: DataTypes.JSON, allowNull: true }, { transaction });
  },
  async down({ queryInterface, transaction }) {
    const table = await queryInterface.describeTable('board_posts');
    if (table.details) await queryInterface.removeColumn('board_posts', 'details', { transaction });
  },
};
