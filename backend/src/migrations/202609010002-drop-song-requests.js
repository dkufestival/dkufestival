async function hasTable(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.map((table) => typeof table === 'string' ? table : table.tableName).includes(tableName);
}

module.exports = {
  async up({ queryInterface, transaction }) {
    if (await hasTable(queryInterface, 'song_requests')) {
      await queryInterface.dropTable('song_requests', { transaction });
    }
  },

  async down() {
    throw new Error('song_requests rollback is intentionally not automated. Restore from backup if needed.');
  },
};
