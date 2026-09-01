const { GlobalChatMessage, Participant, TableSession, Table } = require('../models');
const AppError = require('../errors/AppError');

const HISTORY_LIMIT = 100;

const senderInclude = {
  model: Participant,
  as: 'senderParticipant',
  attributes: ['id', 'nickname'],
  include: [{
    model: TableSession,
    as: 'session',
    attributes: ['id', 'genderType', 'maleCount', 'femaleCount'],
    include: [{ model: Table, as: 'table', attributes: ['tableNumber'] }],
  }],
};

async function getMessages() {
  const rows = await GlobalChatMessage.findAll({
    include: [senderInclude],
    order: [['createdAt', 'DESC']],
    limit: HISTORY_LIMIT,
  });
  return rows.reverse();
}

async function sendAsParticipant(sessionId, participantId, content) {
  if (!content || !content.trim()) throw new AppError(400, 'EMPTY_MESSAGE', 'Message content is required.');
  if (content.trim().length > 500) throw new AppError(400, 'MESSAGE_TOO_LONG', '메시지는 500자 이하로 입력해주세요.');
  const participant = await Participant.findOne({ where: { id: participantId, tableSessionId: sessionId } });
  if (!participant) throw new AppError(403, 'PARTICIPANT_FORBIDDEN', 'Participant not found for this session.');

  const message = await GlobalChatMessage.create({
    senderParticipantId: participantId,
    senderRole: 'PARTICIPANT',
    content: content.trim(),
  });
  return GlobalChatMessage.findByPk(message.id, { include: [senderInclude] });
}

async function sendAsAdmin(content) {
  if (!content || !content.trim()) throw new AppError(400, 'EMPTY_MESSAGE', 'Message content is required.');
  if (content.trim().length > 500) throw new AppError(400, 'MESSAGE_TOO_LONG', '메시지는 500자 이하로 입력해주세요.');
  return GlobalChatMessage.create({
    senderRole: 'ADMIN',
    content: content.trim(),
  });
}

module.exports = { getMessages, sendAsParticipant, sendAsAdmin };
