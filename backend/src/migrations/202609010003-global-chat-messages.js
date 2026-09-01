const { DataTypes } = require('sequelize');

async function hasTable(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.map((table) => typeof table === 'string' ? table : table.tableName).includes(tableName);
}

async function hasIndex(queryInterface, tableName, name) {
  const indexes = await queryInterface.showIndex(tableName);
  return indexes.some((index) => index.name === name);
}

module.exports = {
  async up({ queryInterface, transaction }) {
    if (!(await hasTable(queryInterface, 'global_chat_messages'))) {
      await queryInterface.createTable('global_chat_messages', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        senderParticipantId: { type: DataTypes.INTEGER, allowNull: true },
        senderRole: {
          type: DataTypes.ENUM('PARTICIPANT', 'ADMIN'),
          allowNull: false,
          defaultValue: 'PARTICIPANT',
        },
        content: { type: DataTypes.TEXT, allowNull: false },
        createdAt: { type: DataTypes.DATE, allowNull: false },
      }, { transaction });
    }

    if (!(await hasIndex(queryInterface, 'global_chat_messages', 'global_chat_messages_created_at'))) {
      await queryInterface.addIndex('global_chat_messages', ['createdAt'], {
        name: 'global_chat_messages_created_at',
        transaction,
      });
    }
  },

  async down({ queryInterface, transaction }) {
    if (await hasTable(queryInterface, 'global_chat_messages')) {
      await queryInterface.dropTable('global_chat_messages', { transaction });
    }
  },
};
