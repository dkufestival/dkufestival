const { DataTypes } = require('sequelize');

async function hasColumn(queryInterface, name) {
  const table = await queryInterface.describeTable('participants');
  return Boolean(table[name]);
}

module.exports = {
  async up({ queryInterface, transaction }) {
    if (!await hasColumn(queryInterface, 'blockedAt')) {
      await queryInterface.addColumn('participants', 'blockedAt', { type: DataTypes.DATE, allowNull: true }, { transaction });
    }
    if (!await hasColumn(queryInterface, 'blockedReason')) {
      await queryInterface.addColumn('participants', 'blockedReason', { type: DataTypes.STRING(255), allowNull: true }, { transaction });
    }
    await queryInterface.addIndex('participants', ['clientId', 'blockedAt'], {
      name: 'participants_client_blocked_at', transaction,
    }).catch(() => {});
  },
  async down({ queryInterface, transaction }) {
    await queryInterface.removeIndex('participants', 'participants_client_blocked_at', { transaction }).catch(() => {});
    if (await hasColumn(queryInterface, 'blockedReason')) await queryInterface.removeColumn('participants', 'blockedReason', { transaction });
    if (await hasColumn(queryInterface, 'blockedAt')) await queryInterface.removeColumn('participants', 'blockedAt', { transaction });
  },
};
