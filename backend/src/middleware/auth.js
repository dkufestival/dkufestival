// JWT Bearer 토큰 인증 미들웨어
const jwt = require('jsonwebtoken');

function auth(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization Bearer 토큰이 필요합니다.' });
  }

  const token = authorization.slice('Bearer '.length);

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    return next();
  } catch (error) {
    return res.status(401).json({ message: '유효하지 않거나 만료된 토큰입니다.' });
  }
}

module.exports = auth;
