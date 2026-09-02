const crypto = require('crypto');
const env = require('../config/env');
const { signMonitorToken } = require('../services/token.service');
const AppError = require('../errors/AppError');

function validToken(token) {
  if (!env.monitorToken || !token) return false;
  const expected = Buffer.from(env.monitorToken);
  const received = Buffer.from(String(token));
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

async function authenticate(req, res, next) {
  try {
    if (!validToken(req.body.token)) throw new AppError(401, 'INVALID_MONITOR_TOKEN', '유효하지 않은 모니터링 QR입니다.');
    res.json({ data: { token: signMonitorToken() } });
  } catch (error) { next(error); }
}

async function staffCallTest(req, res, next) {
  try {
    req.app.get('io')?.to('admins').emit('staffCall:test-created', { createdAt: new Date().toISOString() });
    res.status(201).json({ data: { ok: true } });
  } catch (error) { next(error); }
}

module.exports = { authenticate, staffCallTest };
