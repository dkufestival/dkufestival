const jwt = require('jsonwebtoken');
const env = require('../config/env');

function socketAuth(socket, next) {
  const authorization = socket.handshake.headers.authorization;
  const token = socket.handshake.auth?.token
    || (authorization?.startsWith('Bearer ') ? authorization.slice(7) : null);

  if (!token) return next(new Error('AUTH_REQUIRED'));

  try {
    socket.data.user = jwt.verify(token, env.jwtSecret);
    socket.data.sessionId = socket.data.user.sessionId;
    return next();
  } catch (error) {
    return next(new Error('INVALID_TOKEN'));
  }
}

module.exports = socketAuth;
