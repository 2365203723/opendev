// In-memory rate limiter for single-process Node apps.
// 每 IP 每分钟最多 N 条；跨路由共享桶。
// 复杂场景（多进程）换 Redis sliding window。
//
// 用法：
//   const { rateLimit } = require('./rate-limit');
//   app.post('/api/x', rateLimit, handler);

const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 5;

const bucket = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const times = (bucket.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (times.length >= MAX_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
  }
  times.push(now);
  bucket.set(ip, times);
  next();
}

module.exports = { rateLimit };
