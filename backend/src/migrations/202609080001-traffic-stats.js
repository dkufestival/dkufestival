const { DataTypes } = require('sequelize');

async function hasTable(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.map((table) => typeof table === 'string' ? table : table.tableName).includes(tableName);
}

module.exports = {
  async up({ queryInterface, transaction }) {
    if (!await hasTable(queryInterface, 'service_stats')) {
      await queryInterface.createTable('service_stats', {
        id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
        totalUniqueParticipants: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
        totalSessions: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
        totalHttpRequests: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
        totalSocketConnections: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
        peakSocketConnections: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
        peakConcurrentParticipants: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      }, { transaction });
    }
    if (!await hasTable(queryInterface, 'traffic_snapshots')) {
      await queryInterface.createTable('traffic_snapshots', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        recordedAt: { type: DataTypes.DATE, allowNull: false },
        concurrentSocketConnections: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        concurrentParticipants: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        totalHttpRequests: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
        totalSocketConnections: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      }, { transaction });
      await queryInterface.addIndex('traffic_snapshots', ['recordedAt'], { name: 'traffic_snapshots_recorded_at', transaction });
    }
  },
  async down({ queryInterface, transaction }) {
    if (await hasTable(queryInterface, 'traffic_snapshots')) await queryInterface.dropTable('traffic_snapshots', { transaction });
    if (await hasTable(queryInterface, 'service_stats')) await queryInterface.dropTable('service_stats', { transaction });
  },
};
