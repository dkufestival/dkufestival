module.exports = {
  async up({ queryInterface, transaction }) {
    const indexes = await queryInterface.showIndex('basketball_scores');
    for (const index of indexes) {
      const fields = index.fields.map((field) => field.attribute).join(',');
      if (index.unique && fields === 'participantId') {
        await queryInterface.removeIndex('basketball_scores', index.name, { transaction });
      }
    }
    await queryInterface.addIndex('basketball_scores', ['participantId', 'tableSessionId'], {
      unique: true,
      name: 'basketball_scores_participant_session_unique',
      transaction,
    }).catch(() => {});
  },
  async down({ queryInterface, transaction }) {
    await queryInterface.removeIndex('basketball_scores', 'basketball_scores_participant_session_unique', { transaction }).catch(() => {});
    await queryInterface.addIndex('basketball_scores', ['participantId'], { unique: true, name: 'basketball_scores_participant_id_unique', transaction }).catch(() => {});
  },
};
