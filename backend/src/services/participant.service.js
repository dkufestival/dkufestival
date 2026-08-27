const { Participant } = require('../models');
const AppError = require('../errors/AppError');

async function getMe(participantId) {
  const participant = await Participant.findByPk(participantId);
  if (!participant) throw new AppError(404, 'PARTICIPANT_NOT_FOUND', 'Participant not found.');
  return participant;
}

async function updateMe(participantId, data) {
  const participant = await getMe(participantId);
  const nickname = data.nickname?.trim();
  if (!nickname) throw new AppError(400, 'INVALID_NICKNAME', 'nickname is required.');
  return participant.update({ nickname });
}

async function list(sessionId) {
  return Participant.findAll({
    where: { tableSessionId: sessionId },
    order: [['createdAt', 'ASC']],
  });
}

module.exports = { getMe, updateMe, list };
