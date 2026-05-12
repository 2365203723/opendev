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
