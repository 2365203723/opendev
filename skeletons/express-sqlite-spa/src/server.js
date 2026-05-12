const express = require('express');
const helmet = require('helmet');
const path = require('path');
const escape = require('escape-html');
const db = require('./db');
const config = require('./config');
const { rateLimit } = require('./rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 'loopback');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:"]
    }
  }
}));
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- Health check (for DevOps Gate 5) ----
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ---- Site identity ----
app.get('/api/me', (_req, res) => res.json(config));

// ---- TODO: 业务 API 按 design.md 添加 ----
app.get('/api/items', (_req, res) => {
  const rows = db.prepare('SELECT * FROM items ORDER BY created_at DESC').all();
  res.json(rows);
});

app.post('/api/items', rateLimit, (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name || name.length > 200) return res.status(400).json({ error: 'invalid name' });
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  db.prepare('INSERT INTO items (id, name) VALUES (?, ?)').run(id, escape(name));
  res.json({ ok: true, id });
});

// ---- Error handler ----
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

app.listen(PORT, () => {
  console.log(`[${config.name}] http://localhost:${PORT}`);
});
