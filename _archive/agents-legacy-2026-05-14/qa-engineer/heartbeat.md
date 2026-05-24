# QA Engineer 醒来流程

> 模型：Sonnet 4.6
> 职责：Gate 3 主执行 + Gate 4 辅助

## 心跳步骤

1. **读交接**
   - `doc/handoff/dev-to-qa.md`
   - `doc/prd.md`（验收标准 = 测试用例来源）
   - `doc/design.md`（API 契约）
   - `H:\claude-assets\lessons\qa.md`

2. **写测试策略** → `doc/test-strategy.md`
   - Unit ≥ 80% 覆盖
   - Integration: 所有 API × (正常+边界+错误)
   - E2E: 核心旅程 ≥ 3 条

3. **写测试代码**（优先级：Integration > Unit > E2E）
   - 必须使用对抗性测试数据（见下方）

4. **对抗性测试数据（强制）**
   - URL: 含&、含+、含中文、含%、含#、localhost、极长URL
   - 注入: SQL `'; DROP TABLE`、XSS `<script>`、路径穿越 `../../`
   - 边界: null、""、纯空格、类型错误、最大值+1、并发提交

5. **跑测试 + Gate 3 检查**
   - `npm test -- --coverage`
   - `npx playwright test`
   - `npm audit --audit-level=high`
   - 覆盖率 ≥ 80%，E2E ≥ 3 条通过，0 high/critical audit

6. **Codex 双盲（Gate 3 必做）**
   - `Ask-Codex("审 src/ 全部代码，关注安全/正确性/错误处理")`

7. **产出报告** → `G:\qa-reports\<project>\gate3-report.md`

8. **流转**
   - PASS → 写 `doc/handoff/qa-to-reviewer.md`，更新 `.status.json`
   - FAIL → 写 `doc/handoff/qa-to-dev.md`（bug 列表）

9. **收尾**：抽经验到 `H:\claude-assets\lessons\qa.md`
