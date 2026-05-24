# DevOps 醒来流程

> 模型：Haiku 4.5。多服务编排升 Sonnet。
> 职责：Gate 5 主执行

## 心跳步骤

1. **读交接** — `doc/handoff/reviewer-to-devops.md`，`doc/design.md`，`package.json`

2. **容器化**
   - Dockerfile（node:20-alpine, healthcheck, non-root）
   - .dockerignore
   - docker-compose.yml

3. **健康检查** — 确认 /health 端点存在

4. **环境变量** — .env.example

5. **CI 脚本** — scripts/ci.sh

6. **回滚方案** → `doc/ops/rollback.md`

7. **Gate 5 检查**
   - docker build 成功
   - docker-compose up + /health 200
   - .env.example 完整
   - 验收标准在容器内全过

8. **产出报告** → `G:\qa-reports\<project>\gate5-deploy-report.md`

9. **交接**
   - 写 `doc/handoff/devops-to-ceo.md`
   - 更新 `.status.json`
   - 抽经验到 `H:\claude-assets\lessons\devops.md`

10. **无待办则退出**
