const { DataTypes } = require('sequelize');

const gameTypes = ['MISSION', 'OX_QUIZ', 'REACTION', 'RPS', 'TIME_MATCH', 'PINBALL', 'WORD_GUESS', 'ROULETTE', 'IMAGE_GAME', 'BASKETBALL'];
const previousGameTypes = gameTypes.filter((type) => type !== 'BASKETBALL');

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
    await queryInterface.changeColumn('game_sessions', 'type', {
      type: DataTypes.ENUM(...gameTypes),
      allowNull: false,
    }, { transaction });

    if (!(await hasTable(queryInterface, 'basketball_scores'))) {
      await queryInterface.createTable('basketball_scores', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        participantId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
        tableSessionId: { type: DataTypes.INTEGER, allowNull: false },
        bestScore: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        achievedAt: { type: DataTypes.DATE, allowNull: false },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      }, { transaction });
    }
    if (!(await hasIndex(queryInterface, 'basketball_scores', 'basketball_scores_best_score_achieved_at'))) {
      await queryInterface.addIndex('basketball_scores', ['bestScore', 'achievedAt'], {
        name: 'basketball_scores_best_score_achieved_at',
        transaction,
      });
    }
    if (!(await hasIndex(queryInterface, 'basketball_scores', 'basketball_scores_table_session_id'))) {
      await queryInterface.addIndex('basketball_scores', ['tableSessionId'], {
        name: 'basketball_scores_table_session_id',
        transaction,
      });
    }
  },

  async down({ queryInterface, transaction }) {
    if (await hasTable(queryInterface, 'basketball_scores')) {
      await queryInterface.dropTable('basketball_scores', { transaction });
    }
    await queryInterface.changeColumn('game_sessions', 'type', {
      type: DataTypes.ENUM(...previousGameTypes),
      allowNull: false,
    }, { transaction });
  },
};
