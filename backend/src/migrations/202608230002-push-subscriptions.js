const { DataTypes } = require('sequelize');

async function hasTable(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.map((table) => typeof table === 'string' ? table : table.tableName).includes(tableName);
}

module.exports = {
  async up({ queryInterface, transaction }) {
    if (await hasTable(queryInterface, 'push_subscriptions')) return;
    await queryInterface.createTable('push_subscriptions', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      participantId: { type: DataTypes.INTEGER, allowNull: false },
      endpoint: { type: DataTypes.TEXT, allowNull: false },
      p256dh: { type: DataTypes.STRING(255), allowNull: false },
      auth: { type: DataTypes.STRING(255), allowNull: false },
      userAgent: { type: DataTypes.STRING(500), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    }, { transaction });
    await queryInterface.addIndex('push_subscriptions', ['participantId'], { name: 'push_subscriptions_participant_id', transaction });
    await queryInterface.addIndex('push_subscriptions', ['endpoint'], {
      name: 'push_subscriptions_endpoint_unique',
      unique: true,
      length: { endpoint: 191 },
      transaction,
    });
  },

  async down({ queryInterface, transaction }) {
    if (await hasTable(queryInterface, 'push_subscriptions')) {
      await queryInterface.dropTable('push_subscriptions', { transaction });
    }
  },
};
