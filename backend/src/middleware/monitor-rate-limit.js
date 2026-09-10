const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 60;
const hits = new Map();

function clientIp(req) {
  // req.ip is proxy-aware only when the server's existing trust-proxy policy enables it.
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function monitorRateLimit(req, res, next) {
  const now = Date.now();
  const ip = clientIp(req);
  const record = hits.get(ip);
  if (!record || now - record.startedAt >= WINDOW_MS) hits.set(ip, { startedAt: now, count: 1 });
  else if (record.count >= MAX_REQUESTS) return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many monitor requests.' } });
  else record.count += 1;

  for (const [key, value] of hits) if (now - value.startedAt >= WINDOW_MS) hits.delete(key);
  return next();
}

module.exports = { monitorRateLimit, clientIp, hits, WINDOW_MS, MAX_REQUESTS };
