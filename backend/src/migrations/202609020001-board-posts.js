const { DataTypes } = require('sequelize');

async function hasTable(queryInterface, name) {
  const tables = await queryInterface.showAllTables();
  return tables.map((table) => typeof table === 'string' ? table : table.tableName).includes(name);
}

module.exports = {
  async up({ queryInterface, transaction }) {
    if (await hasTable(queryInterface, 'board_posts')) return;
    await queryInterface.createTable('board_posts', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      authorParticipantId: { type: DataTypes.INTEGER, allowNull: false },
      title: { type: DataTypes.STRING(150), allowNull: false },
      content: { type: DataTypes.TEXT, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false },
    }, { transaction });
    await queryInterface.addIndex('board_posts', ['createdAt'], { name: 'board_posts_created_at', transaction });
  },
  async down({ queryInterface, transaction }) {
    if (await hasTable(queryInterface, 'board_posts')) await queryInterface.dropTable('board_posts', { transaction });
  },
};
