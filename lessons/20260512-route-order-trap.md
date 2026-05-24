# 路由注册顺序的陷阱

**类型**：bug-pattern  
**项目来源**：url-shortener（2026-05-12）  
**严重程度**：HIGH

## 问题描述

Express 路由注册顺序决定了请求的匹配优先级。url-shortener 的设计中，如果路由顺序错误，会导致：

1. `/api/*` 路由被 `/:code` 吞掉
2. `/favicon.ico` 被误当作短码查表
3. 静态资源返回 404 而非文件

**Codex 审查发现的问题**（H1）：

```js
// 错误的顺序
app.get('/:code', redirectHandler);        // 太早注册，会吞掉所有单段路径
app.use('/api', linksRouter);               // 永远不会被匹配
app.use(express.static(publicDir));         // 永远不会被匹配
```

## 根因

Express 按注册顺序匹配路由。`/:code` 是一个参数路由，会匹配任何单段路径（包括 `/api`、`/favicon.ico` 等）。

## 解决方案

**正确的注册顺序**（从上到下）：

```js
// 1. 中间件（全局）
app.use(helmet());
app.use(express.json());

// 2. 固定路径 API（最具体）
app.get('/api/health', healthHandler);

// 3. API 路由组
app.use('/api', linksRouter);

// 4. API 404 兜底（必须在 static 之前）
app.use('/api', (req, res) => 
  res.status(404).json({ error: 'not found' })
);

// 5. 静态资源
app.use(express.static(publicDir));

// 6. 参数路由（最不具体，最后注册）
app.head('/:code([a-z0-9]{6})', headRedirectHandler);
app.get('/:code([a-z0-9]{6})', getRedirectHandler);

// 7. 全局 404 兜底
app.use((req, res) => 
  res.status(404).json({ error: 'not found' })
);

// 8. 错误处理
app.use(errorHandler);
```

**关键点**：

1. **固定路径优先**：`/api/health` 在 `/api` router 之前
2. **API 兜底在 static 之前**：否则 `/api/unknown` 会被 static 的 HTML 404 处理
3. **参数路由最后**：`/:code` 必须在所有具体路由之后
4. **参数路由加正则约束**：`/:code([a-z0-9]{6})` 而非 `/:code`，避免吞掉 `/favicon.ico`

## 预防规则

**Architect 检查清单**：
- [ ] 设计文档中明确列出路由注册顺序（如 design.md §6.3）
- [ ] 用注释标注"最后注册"的参数路由
- [ ] 参数路由必须加正则约束（如 `([a-z0-9]{6})`）

**Dev 检查清单**：
- [ ] 在 `src/index.js` 中按设计文档的顺序注册路由
- [ ] 参数路由前加注释：`// 必须最后注册，避免吞掉 /api/* 和静态资源`
- [ ] 本地测试：`curl /api/unknown`、`curl /favicon.ico`、`curl /abc123`，验证各自的响应

**Reviewer 检查清单**：
- [ ] 审查 `src/index.js` 的路由注册顺序，对比设计文档
- [ ] 检查参数路由是否有正则约束
- [ ] 用 curl 测试：
  - `curl /api/unknown` → 应返回 JSON 404
  - `curl /favicon.ico` → 应返回 404 或文件
  - `curl /abc123` → 应返回 JSON 404（不是短码）
  - `curl /abcdef` → 应返回 302 或 JSON 404（取决于 DB）

## 测试用例

```bash
# 测试 1：API 404 应返回 JSON
curl -s http://localhost:3001/api/unknown | jq .
# 期望：{"error":"not found"}

# 测试 2：favicon 不应被当作短码
curl -s http://localhost:3001/favicon.ico
# 期望：404 或文件内容，不是 JSON

# 测试 3：非 6 位码不应被当作短码
curl -s http://localhost:3001/abc
# 期望：404 JSON，不是数据库查询

# 测试 4：6 位码应被当作短码
curl -s http://localhost:3001/abcdef
# 期望：302 或 JSON 404（取决于 DB 中是否存在）
```

## 相关经验

参考 `reviewer.md` 条 2：章程布尔验收 + 三类复核分别跑。本条是其补充：**路由顺序是 Express 应用的常见陷阱，应在设计和审查阶段重点关注**。
