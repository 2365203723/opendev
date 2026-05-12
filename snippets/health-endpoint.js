// Express /api/health 健康检查。DevOps Gate 5 必需。
//
// 返回：200 JSON + 基础状态
// 要点：
//   - 别依赖 DB（DB 挂了健康检查也应返 200，让 LB 知道"进程活着但下游炸了"，用别的监控去告警）
//   - 或者分 /api/health（快速）和 /api/health/deep（含 DB）
//   - HEAD 也支持，减少日志噪声

function mountHealth(app) {
  // Shallow：进程活着就 OK
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  // Deep：检查下游依赖（按需接入真实 DB/Redis ping）
  app.get('/api/health/deep', (_req, res) => {
    const checks = {
      process: true,
      uptime: process.uptime(),
      memory: process.memoryUsage().rss,
      // db: typeof db !== 'undefined' ? !!db.open : null,
    };
    const ok = Object.values(checks).every(v => v !== false);
    res.status(ok ? 200 : 503).json({ ok, checks, ts: new Date().toISOString() });
  });

  // HEAD 版本：只返 200，不返 body
  app.head('/api/health', (_req, res) => res.status(200).end());
}

module.exports = { mountHealth };
