const { DataTypes } = require('sequelize');

const gameTypes = ['MISSION', 'OX_QUIZ', 'REACTION', 'RPS', 'TIME_MATCH', 'PINBALL', 'WORD_GUESS', 'ROULETTE', 'IMAGE_GAME', 'BASKETBALL'];
const previousGameTypes = gameTypes.filter((type) => type !== 'BASKETBALL');

module.exports = {
  async up({ queryInterface, transaction }) {
    await queryInterface.changeColumn('game_sessions', 'type', {
      type: DataTypes.ENUM(...gameTypes),
      allowNull: false,
    }, { transaction });

    await queryInterface.createTable('basketball_scores', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      participantId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
      tableSessionId: { type: DataTypes.INTEGER, allowNull: false },
      bestScore: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      achievedAt: { type: DataTypes.DATE, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    }, { transaction });
    await queryInterface.addIndex('basketball_scores', ['bestScore', 'achievedAt'], { transaction });
    await queryInterface.addIndex('basketball_scores', ['tableSessionId'], { transaction });
  },

  async down({ queryInterface, transaction }) {
    await queryInterface.dropTable('basketball_scores', { transaction });
    await queryInterface.changeColumn('game_sessions', 'type', {
      type: DataTypes.ENUM(...previousGameTypes),
      allowNull: false,
    }, { transaction });
  },
};
