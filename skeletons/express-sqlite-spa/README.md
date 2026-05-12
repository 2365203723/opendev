# Express + SQLite + SPA Skeleton

MVP 级单仓模板：Node 20 + Express 4 + better-sqlite3 + 原生 HTML/CSS/JS。一条命令启动。

来源：2026-05-09 personal-blog MVP 项目成功产出物，10/10 章程验收通过后抽象成骨架。

## 使用

```bash
# 从 skeleton 拷贝
cp -r H:/claude-assets/skeletons/express-sqlite-spa/* E:/projects/<your-project>/

cd E:/projects/<your-project>/src
# 按需改 package.json 的 name 和 config.js
npm install --registry=https://registry.npmmirror.com
npm run dev
# 打开 http://localhost:3000
```

## 骨架自带

- Express 4 + helmet（CSP 严格）
- better-sqlite3（同步，Windows 友好）
- 内存限流（每 IP 每分钟 ≤ 5 次，跨路由共享桶）
- escape-html 服务端转义 + 前端 `textContent` 双层 XSS 防御
- `/api/health` 健康检查端点（DevOps Gate 5 需要）
- 配置式身份（src/config.js）
- 单页 SPA + fetch API + 表单验证

## 不含

- 认证/登录（按需补）
- ORM（小项目用不上）
- 构建工具（单页原生 JS 无需）
- 前端框架（故意不引）
- 数据库迁移工具（用 `INSERT OR IGNORE` seed 模式）
- 单元测试（QA Engineer 根据 design.md 补）

## 适用场景

- 静态主页 + 轻量 API
- 内部工具（单用户/少量数据）
- 概念验证 (PoC)
- 博客 / Landing page / 作品集

## 不适用场景

- 高并发（>100 QPS，换 Fastify + PostgreSQL）
- 多用户认证系统（引 passport 或 auth0）
- SSR/SEO 关键（上 Next.js）
- 实时通信（加 socket.io 或 SSE）

## 文件清单

| 文件 | 作用 | 需改？ |
|------|------|--------|
| `package.json` | 依赖 | name/description |
| `src/server.js` | Express 路由 | API 按业务增改 |
| `src/db.js` | SQLite schema + seed | schema 按业务改 |
| `src/config.js` | 站点身份 | 必改 |
| `src/rate-limit.js` | 限流 | 按需调 MAX/WINDOW |
| `src/data/seed.json` | 初始数据 | 按业务改 |
| `src/public/index.html` | 入口 HTML | 按设计改 |
| `src/public/css/style.css` | 基础样式 | 按设计改 |
| `src/public/js/app.js` | 前端逻辑 | 按业务改 |

## 已验证

- Windows 11 + Node 20.x
- Chrome/Edge 浏览器
- npm 10.x（国内源 registry.npmmirror.com）
