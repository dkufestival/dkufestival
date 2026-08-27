const { DataTypes } = require('sequelize');

module.exports = {
  async up({ queryInterface, transaction }) {
    await queryInterface.changeColumn('game_sessions', 'type', {
      type: DataTypes.ENUM('MISSION', 'OX_QUIZ', 'REACTION', 'RPS', 'TIME_MATCH', 'PINBALL', 'WORD_GUESS', 'ROULETTE', 'IMAGE_GAME'),
      allowNull: false,
    }, { transaction });
  },

  async down({ queryInterface, transaction }) {
    await queryInterface.changeColumn('game_sessions', 'type', {
      type: DataTypes.ENUM('MISSION', 'OX_QUIZ', 'REACTION', 'RPS', 'TIME_MATCH', 'PINBALL'),
      allowNull: false,
    }, { transaction });
  },
};
