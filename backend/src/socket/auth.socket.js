const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { Participant, TableSession } = require('../models');

async function socketAuth(socket, next) {
  const authorization = socket.handshake.headers.authorization;
  const token = socket.handshake.auth?.token
    || (authorization?.startsWith('Bearer ') ? authorization.slice(7) : null);

  if (!token) return next(new Error('AUTH_REQUIRED'));

  try {
    const user = jwt.verify(token, env.jwtSecret);
    if (user.role === 'PARTICIPANT' && user.participantId) {
      const participant = await Participant.findByPk(user.participantId);
      const session = participant ? await TableSession.findByPk(user.sessionId) : null;
      if (!participant || participant.kickedAt || !session || session.status !== 'ACTIVE' || new Date(session.expiresAt) <= new Date()) {
        return next(new Error('INVALID_PARTICIPANT_SESSION'));
      }
    }
    socket.data.user = user;
    socket.data.sessionId = user.sessionId;
    socket.data.participantId = user.participantId;
    return next();
  } catch (error) {
    return next(new Error('INVALID_TOKEN'));
  }
}

module.exports = socketAuth;
