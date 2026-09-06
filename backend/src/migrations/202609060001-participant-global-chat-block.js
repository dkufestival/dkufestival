const { DataTypes } = require('sequelize');

async function hasColumn(queryInterface, name) {
  const table = await queryInterface.describeTable('participants');
  return Boolean(table[name]);
}

module.exports = {
  async up({ queryInterface, transaction }) {
    if (!await hasColumn(queryInterface, 'globalChatBlockedAt')) {
      await queryInterface.addColumn('participants', 'globalChatBlockedAt', { type: DataTypes.DATE, allowNull: true }, { transaction });
    }
    if (!await hasColumn(queryInterface, 'globalChatBlockedReason')) {
      await queryInterface.addColumn('participants', 'globalChatBlockedReason', { type: DataTypes.STRING(255), allowNull: true }, { transaction });
    }
  },
  async down({ queryInterface, transaction }) {
    if (await hasColumn(queryInterface, 'globalChatBlockedReason')) await queryInterface.removeColumn('participants', 'globalChatBlockedReason', { transaction });
    if (await hasColumn(queryInterface, 'globalChatBlockedAt')) await queryInterface.removeColumn('participants', 'globalChatBlockedAt', { transaction });
  },
};
