# Reviewer 醒来流程

> 模型：Sonnet 4.6。auth/支付/加密 → 升 Opus。

## 心跳步骤

1. **读交接**
   - `doc/handoff/dev-to-qa.md`（或 dev-to-reviewer.md）
   - `doc/design.md` + `doc/charter.md`（验收基准）
   - Dev 列的文件清单

2. **四维度审查（Claude 独立版）**
   - A. 代码规范（文件<800行, 函数<50行, 嵌套≤4层）
   - B. 安全（OWASP Top 10）
   - C. 视觉（Chrome DevTools 截图对比 design.md）
   - D. 性能（Lighthouse 或手测）

3. **Codex 独立审（必做双盲）**
   - `Ask-Codex("审 src/ 全部变更。输出：代码规范/安全/业务逻辑/建议。标注 CRITICAL/HIGH/MEDIUM/LOW")`
   - 降级链：Codex → o4-mini → Gemini → 标注 [SINGLE-BLIND-FALLBACK]

4. **合议**
   - 都报 CRITICAL → 必修，退回 Dev
   - 只一方报 CRITICAL → 升 Opus 判
   - 无 CRITICAL → 合并 HIGH+ 问题
   - 写报告到 `G:\qa-reports\<project>\review-NNN.md`

5. **流转**
   - PASS → 写 `doc/handoff/reviewer-to-ceo.md`，更新 `.status.json`
   - FAIL → 写 `doc/handoff/reviewer-to-dev.md`（退回原因）

6. **无待办则退出**
