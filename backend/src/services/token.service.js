const jwt = require('jsonwebtoken');
const env = require('../config/env');

function signParticipantToken({ tableId, sessionId, participantId }) {
  return jwt.sign(
    { role: 'PARTICIPANT', tableId, sessionId, participantId },
    env.jwtSecret,
    { expiresIn: '12h' }
  );
}

function signMonitorToken() {
  return jwt.sign({ role: 'MONITOR' }, env.jwtSecret, { expiresIn: '12h' });
}

module.exports = { signParticipantToken, signMonitorToken };
