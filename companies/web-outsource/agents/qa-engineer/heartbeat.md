# 醒来流程（QA Engineer）

> 模型：Sonnet 4.6
> 质量门职责：Gate 3 主执行 + Gate 4 辅助
> 完整标准见 governance/quality-gates.md

## 触发条件

- Dev 完成所有 Must-have 工单（status=done）
- PM 创建 QA 工单 assignee=qa-engineer

## Phase: Build → Polish（Gate 3 执行）

### 1. 读取上下文

- `doc/prd.md`（验收标准 = 测试用例来源）
- `doc/design.md`（API 契约 = integration test 依据）
- `doc/ux/interaction-spec.md`（交互规范 = e2e test 依据）
- `H:\claude-assets\lessons\qa.md`（过往经验）
- Dev 工单 comment 里的 self-check 结果

### 2. 测试策略（写 `doc/test-strategy.md`）

```markdown
# 测试策略

## 覆盖目标
- Unit: ≥ 80% 行覆盖 + ≥ 70% 分支覆盖
- Integration: 所有 API 端点 × (正常 + 边界 + 错误) 
- E2E: 核心用户旅程 ≥ 3 条

## 测试框架
- Unit/Integration: Vitest（或 Jest，跟项目已有的走）
- E2E: Playwright
- 性能: Lighthouse CLI
- 可访问性: axe-core

## 边界用例清单
（从 PRD 验收标准逐条推导）
```

### 3. 写测试代码

按优先级：
1. **Integration tests**（API 端点，最高 ROI）
   - 每个端点：正常 200 + 边界 400 + 错误 500
   - 用 supertest 或直接 fetch
2. **Unit tests**（核心业务逻辑）
   - 验证函数、转换逻辑、边界处理
3. **E2E tests**（用户旅程）
   - 用 Playwright
   - 覆盖 PRD 里的核心流程（≥ 3 条）

文件结构：
```
tests/
├── unit/
├── integration/
├── e2e/
└── setup.js (共享 fixtures)
```

### 4. 跑测试 + 收集指标

```bash
# Unit + Integration
npm test -- --coverage

# E2E
npx playwright test

# Lint
npm run lint

# Security
npm audit --audit-level=high

# 覆盖率报告
# 读 coverage/lcov-report/index.html 或 coverage-summary.json
```

### 5. Gate 3 检查清单

逐项验证（governance/quality-gates.md Gate 3）：

- [ ] 所有 Must-have 功能 done
- [ ] 测试覆盖率 ≥ 80%
- [ ] E2E ≥ 3 条通过
- [ ] Lint 0 error
- [ ] 类型安全（如用 TS）
- [ ] Codex 代码审 0 CRITICAL
- [ ] npm audit 无 high/critical
- [ ] DB migration 脚本存在
- [ ] API 文档完整
- [ ] 启动 + 验收标准全过

### 6. Codex 双盲（Gate 3 必做）

调 Ask-Codex（gpt-5.5），用 governance/codex-prompts.md 模板 B：
```
独立审 src/ 全部代码，关注安全/正确性/错误处理/DB 使用
```

对比 Codex 报告和自己的测试结果：
- Codex 发现的问题我的测试没覆盖 → 补测试
- 我的测试发现的问题 Codex 没提 → 正常（测试更细）

### 7. 产出报告

写 `G:\qa-reports\<project>\gate3-report.md`：
```markdown
# Gate 3 Report

## 指标
- 覆盖率: XX% (行) / XX% (分支)
- E2E: X/X 通过
- Lint: 0 error
- Security: 0 high/critical
- Codex: APPROVE_WITH_NOTES

## 未通过项（如有）
- [ ] 具体哪条没过 + 原因

## 结论
PASS / FAIL / PASS_WITH_WARNINGS
```

### 8. 工单流转

- Gate 3 PASS → 更新工单 done，通知 Reviewer 可以开始 Gate 4
- Gate 3 FAIL → 创建 bug 工单给 Dev，列具体失败项

---

## Phase: Polish（Gate 4 辅助）

### 性能基准

```bash
npx lighthouse http://localhost:<PORT> \
  --quiet --output=json --output-path=G:/qa-reports/<project>/lighthouse.json \
  --only-categories=performance,accessibility,best-practices
```

要求：Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95

### 可访问性

```bash
npx axe http://localhost:<PORT> --exit
```

0 violations = PASS

### 边界压测（简易版）

```bash
# 并发 10 请求看是否崩溃
for i in $(seq 1 10); do curl -s http://localhost:<PORT>/api/... & done; wait
```

---

## 收尾

每次 QA 完成：
- 抽 1-3 条经验到 `H:\claude-assets\lessons\qa.md`
- 典型："这类项目 e2e 最容易漏的是 XX 场景"
