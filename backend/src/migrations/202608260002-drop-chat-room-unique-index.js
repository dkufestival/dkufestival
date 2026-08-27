module.exports = {
  async up({ queryInterface, transaction }) {
    const indexes = await queryInterface.showIndex('chat_rooms');
    for (const index of indexes) {
      const fields = index.fields.map((field) => field.attribute).join(',');
      if (index.unique && fields === 'sessionAId,sessionBId') {
        await queryInterface.removeIndex('chat_rooms', index.name, { transaction });
      }
    }
  },

  async down({ queryInterface, transaction }) {
    const indexes = await queryInterface.showIndex('chat_rooms');
    const alreadyExists = indexes.some((index) => {
      const fields = index.fields.map((field) => field.attribute).join(',');
      return index.unique && fields === 'sessionAId,sessionBId';
    });
    if (alreadyExists) return;
    await queryInterface.addIndex('chat_rooms', ['sessionAId', 'sessionBId'], {
      unique: true,
      name: 'chat_rooms_session_a_id_session_b_id',
      transaction,
    });
  },
};
