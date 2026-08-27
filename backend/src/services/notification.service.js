const { Op } = require('sequelize');
const { Participant } = require('../models');
const pushService = require('./push.service');

async function notifySessions(sessionIds, payload) {
  const ids = Array.isArray(sessionIds) ? sessionIds : [sessionIds];
  const participants = await Participant.findAll({ where: { tableSessionId: { [Op.in]: ids } } });
  await Promise.all(participants.map((participant) => pushService.sendToParticipant(participant.id, payload)));
}

module.exports = { notifySessions };
