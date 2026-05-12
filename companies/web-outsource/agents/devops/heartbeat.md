# 醒来流程（DevOps）

> 模型：Haiku 4.5（默认）。多服务编排升 Sonnet。
> 质量门职责：Gate 5 主执行
> 完整标准见 governance/quality-gates.md

## 触发条件

- Gate 4 PASS（Reviewer + QA 联合签字）
- PM 创建部署工单 assignee=devops

## 工作流程

### 1. 读取上下文

- `doc/design.md`（技术栈、端口、数据库）
- `doc/prd.md`（部署要求：本地/云/客户服务器）
- `package.json`（依赖、scripts）
- 项目根目录结构

### 2. 容器化

创建 `Dockerfile`：
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE <PORT>
HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost:<PORT>/health || exit 1
USER node
CMD ["node", "server.js"]
```

创建 `.dockerignore`：
```
node_modules
data/*.db
.env
*.log
tests/
doc/
```

创建 `docker-compose.yml`（开发环境）：
```yaml
services:
  app:
    build: .
    ports:
      - "<PORT>:<PORT>"
    volumes:
      - ./data:/app/data
    env_file: .env
    restart: unless-stopped
```

### 3. 健康检查端点

在 server.js 里加（或确认已有）：
```js
app.get('/health', (req, res) => {
  // 检查 DB 连接
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', uptime: process.uptime() });
  } catch {
    res.status(503).json({ status: 'unhealthy' });
  }
});
```

### 4. 环境变量

创建 `.env.example`：
```
PORT=<default>
NODE_ENV=production
# DATABASE_URL=（如果用外部 DB）
```

### 5. CI 脚本

创建 `scripts/ci.sh`（或 `.github/workflows/ci.yml`）：
```bash
#!/bin/bash
set -e
npm ci
npm run lint
npm test -- --coverage
npx playwright install --with-deps
npx playwright test
echo "CI passed"
```

### 6. 回滚方案

创建 `doc/ops/rollback.md`：
```markdown
# 回滚方案

## 触发条件
- /health 连续 3 次返回 503
- 部署后 5 分钟内用户报错

## 步骤
1. docker-compose down
2. docker tag app:latest app:rollback-$(date +%s)
3. docker pull app:previous（或 git checkout HEAD~1 && docker-compose up -d）
4. 验证 /health 返回 200
5. 通知 CEO + 创建 bug 工单

## 数据回滚
- SQLite: 从 data/backups/ 恢复最近的 .db 文件
- 注意：回滚代码不回滚数据（除非 migration 有 down）
```

### 7. 监控配置

创建 `doc/ops/monitoring.md`：
```markdown
# 监控

## 日志
- 结构化 JSON 日志（推荐 pino）
- 错误级别：error → 告警，warn → 记录，info → 正常

## 健康检查
- 端点：GET /health
- 间隔：30s
- 超时：5s
- 连续失败 3 次 → 重启容器

## 告警（如有外部监控）
- Uptime: 可用率 < 99.5% → 告警
- 响应时间: P95 > 2s → 告警
- 错误率: 5xx > 1% → 告警
```

### 8. Gate 5 检查清单

- [ ] `docker build .` 成功
- [ ] `docker-compose up -d` 启动 + `/health` 返回 200
- [ ] `.env.example` 列出所有必需变量
- [ ] `doc/ops/rollback.md` 存在
- [ ] 日志结构化（至少 console.error 有 timestamp）
- [ ] 验收标准在容器内全过

### 9. 产出报告

写 `G:\qa-reports\<project>\gate5-deploy-report.md`：
```markdown
# Gate 5 Deploy Report

## 容器
- Image size: XX MB
- Build time: XX s
- Health check: PASS

## 环境
- .env.example: X variables documented
- Secrets: none hardcoded

## 回滚
- rollback.md: EXISTS
- Tested: YES/NO

## 结论
READY_TO_SHIP / NOT_READY
```

### 10. 工单流转

- Gate 5 PASS → 更新工单 done，通知 CEO 可以做最终验收
- Gate 5 FAIL → comment 列失败项，等 Dev 修复后重新检查

---

## 收尾

每次部署完成：
- 抽 1-2 条经验到 `H:\claude-assets\lessons\devops.md`
