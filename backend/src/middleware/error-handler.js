const AppError = require('../errors/AppError');

function notFound(req, res) {
  res.status(404).json({
    error: { code: 'ROUTE_NOT_FOUND', message: '요청한 API 경로를 찾을 수 없습니다.' },
  });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  const knownError = error instanceof AppError;
  const status = knownError ? error.status : 500;
  const code = knownError ? error.code : 'INTERNAL_SERVER_ERROR';
  const message = knownError ? error.message : '서버 처리 중 오류가 발생했습니다.';

  if (!knownError) console.error(error);

  return res.status(status).json({
    error: {
      code,
      message,
      ...(knownError && error.details ? { details: error.details } : {}),
    },
  });
}

module.exports = { notFound, errorHandler };
