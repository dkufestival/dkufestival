const { DataTypes } = require('sequelize');

async function hasColumn(queryInterface, tableName, columnName, transaction) {
  const columns = await queryInterface.describeTable(tableName, { transaction });
  return Boolean(columns[columnName]);
}

async function addColumnIfMissing(queryInterface, tableName, columnName, definition, transaction) {
  if (!await hasColumn(queryInterface, tableName, columnName, transaction)) {
    await queryInterface.addColumn(tableName, columnName, definition, { transaction });
  }
}

module.exports = {
  async up({ queryInterface, transaction }) {
    await addColumnIfMissing(queryInterface, 'service_stats', 'totalSocketEvents', { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 }, transaction);
    await addColumnIfMissing(queryInterface, 'service_stats', 'peakHttpRps', { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 }, transaction);
    await addColumnIfMissing(queryInterface, 'service_stats', 'peakSocketEventsPerSecond', { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 }, transaction);
    await addColumnIfMissing(queryInterface, 'traffic_snapshots', 'averageHttpRps', { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 }, transaction);
    await addColumnIfMissing(queryInterface, 'traffic_snapshots', 'maxHttpRps', { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 }, transaction);
    await addColumnIfMissing(queryInterface, 'traffic_snapshots', 'averageSocketEventsPerSecond', { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 }, transaction);
    await addColumnIfMissing(queryInterface, 'traffic_snapshots', 'maxSocketEventsPerSecond', { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 }, transaction);
  },
  async down({ queryInterface, transaction }) {
    for (const [table, column] of [
      ['traffic_snapshots', 'maxSocketEventsPerSecond'], ['traffic_snapshots', 'averageSocketEventsPerSecond'],
      ['traffic_snapshots', 'maxHttpRps'], ['traffic_snapshots', 'averageHttpRps'],
      ['service_stats', 'peakSocketEventsPerSecond'], ['service_stats', 'peakHttpRps'], ['service_stats', 'totalSocketEvents'],
    ]) {
      if (await hasColumn(queryInterface, table, column, transaction)) await queryInterface.removeColumn(table, column, { transaction });
    }
  },
};
