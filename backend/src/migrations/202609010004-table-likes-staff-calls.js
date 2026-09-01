const { DataTypes } = require('sequelize');

async function hasTable(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.map((table) => (typeof table === 'string' ? table : table.tableName)).includes(tableName);
}

async function hasIndex(queryInterface, tableName, indexName) {
  const indexes = await queryInterface.showIndex(tableName);
  return indexes.some((index) => index.name === indexName);
}

module.exports = {
  async up({ queryInterface, transaction }) {
    if (!(await hasTable(queryInterface, 'table_likes'))) {
      await queryInterface.createTable('table_likes', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        fromSessionId: { type: DataTypes.INTEGER, allowNull: false },
        toSessionId: { type: DataTypes.INTEGER, allowNull: false },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      }, { transaction });
    }
    if (!(await hasIndex(queryInterface, 'table_likes', 'table_likes_from_to_unique'))) {
      await queryInterface.addIndex('table_likes', ['fromSessionId', 'toSessionId'], {
        name: 'table_likes_from_to_unique', unique: true, transaction,
      });
    }
    if (!(await hasIndex(queryInterface, 'table_likes', 'table_likes_to_session_id'))) {
      await queryInterface.addIndex('table_likes', ['toSessionId'], {
        name: 'table_likes_to_session_id', transaction,
      });
    }

    if (!(await hasTable(queryInterface, 'staff_calls'))) {
      await queryInterface.createTable('staff_calls', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        tableSessionId: { type: DataTypes.INTEGER, allowNull: false },
        status: {
          type: DataTypes.ENUM('PENDING', 'RESOLVED'), allowNull: false, defaultValue: 'PENDING',
        },
        resolvedAt: { type: DataTypes.DATE, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      }, { transaction });
    }
    if (!(await hasIndex(queryInterface, 'staff_calls', 'staff_calls_session_status'))) {
      await queryInterface.addIndex('staff_calls', ['tableSessionId', 'status'], {
        name: 'staff_calls_session_status', transaction,
      });
    }
  },

  async down({ queryInterface, transaction }) {
    if (await hasTable(queryInterface, 'staff_calls')) {
      await queryInterface.dropTable('staff_calls', { transaction });
    }
    if (await hasTable(queryInterface, 'table_likes')) {
      await queryInterface.dropTable('table_likes', { transaction });
    }
  },
};
