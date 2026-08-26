module.exports = {
  async up({ queryInterface, transaction }) {
    await queryInterface.removeIndex('chat_rooms', 'chat_rooms_session_a_id_session_b_id', { transaction });
  },

  async down({ queryInterface, transaction }) {
    await queryInterface.addIndex('chat_rooms', ['sessionAId', 'sessionBId'], {
      unique: true,
      name: 'chat_rooms_session_a_id_session_b_id',
      transaction,
    });
  },
};
