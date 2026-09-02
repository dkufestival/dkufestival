const { DataTypes } = require('sequelize');

module.exports = {
  async up({ queryInterface, transaction }) {
    const table = await queryInterface.describeTable('participants');
    if (!table.gender) await queryInterface.addColumn('participants', 'gender', { type: DataTypes.ENUM('MALE', 'FEMALE'), allowNull: true }, { transaction });
  },
  async down({ queryInterface, transaction }) {
    const table = await queryInterface.describeTable('participants');
    if (table.gender) await queryInterface.removeColumn('participants', 'gender', { transaction });
  },
};
