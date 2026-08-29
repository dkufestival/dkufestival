const { DataTypes } = require('sequelize');

module.exports = {
  async up({ queryInterface, transaction }) {
    await queryInterface.changeColumn('game_sessions', 'type', {
      // 이전 마이그레이션이 누락된 운영 DB에서도 이미 저장된 최신 게임 타입을 보존합니다.
      type: DataTypes.ENUM('MISSION', 'OX_QUIZ', 'REACTION', 'RPS', 'TIME_MATCH', 'PINBALL', 'WORD_GUESS', 'ROULETTE', 'IMAGE_GAME'),
      allowNull: false,
    }, { transaction });
  },

  async down({ queryInterface, transaction }) {
    await queryInterface.changeColumn('game_sessions', 'type', {
      type: DataTypes.ENUM('MISSION', 'OX_QUIZ', 'REACTION', 'RPS', 'TIME_MATCH'),
      allowNull: false,
    }, { transaction });
  },
};
