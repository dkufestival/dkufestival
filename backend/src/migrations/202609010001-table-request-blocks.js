const { DataTypes } = require('sequelize');

async function hasTable(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.map((table) => typeof table === 'string' ? table : table.tableName).includes(tableName);
}

module.exports = {
  async up({ queryInterface, transaction }) {
    if (await hasTable(queryInterface, 'table_request_blocks')) return;
    await queryInterface.createTable('table_request_blocks', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      blockerSessionId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'table_sessions', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      blockedSessionId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'table_sessions', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    }, { transaction });
    await queryInterface.addIndex('table_request_blocks', ['blockerSessionId', 'blockedSessionId'], {
      name: 'table_request_blocks_pair_unique',
      unique: true,
      transaction,
    });
    await queryInterface.addIndex('table_request_blocks', ['blockedSessionId'], {
      name: 'table_request_blocks_blocked_session_id',
      transaction,
    });
  },

  async down({ queryInterface, transaction }) {
    if (await hasTable(queryInterface, 'table_request_blocks')) {
      await queryInterface.dropTable('table_request_blocks', { transaction });
    }
  },
};
