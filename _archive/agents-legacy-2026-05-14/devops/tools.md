# DevOps 工具

## 文件
- Read, Glob, Grep
- Write（Dockerfile, docker-compose.yml, .dockerignore, .env.example, scripts/*, doc/ops/*, doc/handoff/*.md, .status.json）
- Edit（package.json scripts, server.js /health 端点）

## Bash
- docker build/compose, npm ci/lint/test, curl, chmod
- 禁止：rm -rf, git push --force, docker system prune -a

## 禁写
- src/ 业务逻辑（只能加 /health + 日志中间件）
- tests/
