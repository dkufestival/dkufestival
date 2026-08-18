const env = require('../config/env');

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function defaultExpiresAt(startedAt = new Date()) {
  return addMinutes(startedAt, env.sessionDurationMinutes);
}

function isActiveSession(session) {
  return Boolean(session && session.status === 'ACTIVE' && new Date(session.expiresAt) > new Date());
}

module.exports = { addMinutes, defaultExpiresAt, isActiveSession };
