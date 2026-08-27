const AppError = require('../errors/AppError');

function validateBody(schema) {
  return (req, res, next) => {
    const errors = [];
    const sanitized = {};

    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} 값이 필요합니다.`);
        continue;
      }
      if (value === undefined) continue;

      if (rules.type === 'string' && typeof value !== 'string') errors.push(`${field}는 문자열이어야 합니다.`);
      if (rules.type === 'number' && (!Number.isInteger(Number(value)) || Number(value) < (rules.min ?? -Infinity))) {
        errors.push(`${field}는 ${rules.min ?? 0} 이상의 정수여야 합니다.`);
      }
      if (rules.enum && !rules.enum.includes(value)) errors.push(`${field} 값이 허용 범위에 없습니다.`);
      if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
        errors.push(`${field}는 ${rules.maxLength}자를 초과할 수 없습니다.`);
      }

      sanitized[field] = rules.type === 'number' ? Number(value) : value;
    }

    if (errors.length) return next(new AppError(400, 'VALIDATION_ERROR', '요청 값이 올바르지 않습니다.', errors));
    req.body = sanitized;
    return next();
  };
}

module.exports = { validateBody };
