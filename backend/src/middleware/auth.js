// JWT Bearer 토큰 인증 미들웨어
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { Participant, TableSession } = require('../models');

async function auth(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({
      error: { code: 'AUTH_REQUIRED', message: 'Authorization Bearer 토큰이 필요합니다.' },
    });
  }

  const token = authorization.slice('Bearer '.length);

  try {
    req.user = jwt.verify(token, env.jwtSecret);
    if (req.user.role === 'PARTICIPANT') {
      const participant = await Participant.findByPk(req.user.participantId);
      const session = participant
        ? await TableSession.findByPk(req.user.sessionId)
        : null;
      if (!participant || participant.kickedAt || !session || session.status !== 'ACTIVE' || new Date(session.expiresAt) <= new Date()) {
        return res.status(401).json({
          error: { code: 'INVALID_PARTICIPANT_SESSION', message: 'Participant session is not active.' },
        });
      }
      req.participant = participant;
      req.tableSession = session;
    }
    return next();
  } catch (error) {
    return res.status(401).json({
      error: { code: 'INVALID_TOKEN', message: '유효하지 않거나 만료된 토큰입니다.' },
    });
  }
}

module.exports = auth;
