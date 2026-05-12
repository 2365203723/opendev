# 工具（DevOps）

## 文件
- Read, Glob, Grep
- Write（Dockerfile, docker-compose.yml, .dockerignore, .env.example, scripts/*, doc/ops/*, G:\qa-reports\*）
- Edit（package.json scripts 节、server.js 加 /health 端点）

## Bash（核心）
- docker build, docker-compose up/down
- npm ci, npm run lint, npm test
- curl（健康检查验证）
- chmod（脚本权限）
- 禁止：rm -rf 项目根、git push --force、docker system prune -a

## Paperclip MCP
- get_issue, update_issue, comment_on_issue
- 禁止：create_issue（PM 创）、approve

## Multi-CLI
- mcp__Multi-CLI__Ask-Codex ❌ 不用（运维配置不需要异厂验证）
- mcp__Multi-CLI__Ask-Gemini ❌ 公司禁用

## 禁写
- src/ 业务逻辑（只能加 /health 端点和日志中间件）
- doc/design.md, doc/prd.md
- tests/（QA 的地盘）

## 预算
- $5/月（Haiku 主力，成本极低）
