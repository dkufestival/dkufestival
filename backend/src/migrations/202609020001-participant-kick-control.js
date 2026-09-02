const { DataTypes } = require('sequelize');

async function hasColumn(queryInterface, tableName, columnName) {
  const table = await queryInterface.describeTable(tableName);
  return Boolean(table[columnName]);
}

module.exports = {
  async up({ queryInterface, transaction }) {
    if (!await hasColumn(queryInterface, 'participants', 'kickedAt')) {
      await queryInterface.addColumn('participants', 'kickedAt', { type: DataTypes.DATE, allowNull: true }, { transaction });
    }
    if (!await hasColumn(queryInterface, 'participants', 'kickedReason')) {
      await queryInterface.addColumn('participants', 'kickedReason', { type: DataTypes.STRING(255), allowNull: true }, { transaction });
    }
    await queryInterface.addIndex('participants', ['clientId', 'kickedAt'], {
      name: 'participants_client_kicked_at', transaction,
    }).catch(() => {});
  },

  async down({ queryInterface, transaction }) {
    await queryInterface.removeIndex('participants', 'participants_client_kicked_at', { transaction }).catch(() => {});
    if (await hasColumn(queryInterface, 'participants', 'kickedReason')) await queryInterface.removeColumn('participants', 'kickedReason', { transaction });
    if (await hasColumn(queryInterface, 'participants', 'kickedAt')) await queryInterface.removeColumn('participants', 'kickedAt', { transaction });
  },
};
