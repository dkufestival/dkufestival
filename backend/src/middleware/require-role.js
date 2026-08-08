function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: '해당 기능을 사용할 권한이 없습니다.' },
      });
    }
    return next();
  };
}

module.exports = requireRole;
