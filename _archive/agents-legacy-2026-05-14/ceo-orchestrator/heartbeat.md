# CEO 醒来流程

> 模型：Sonnet 4.6。升 Opus：首单客户 / 单价 > $1000 / 章程歧义 / 分歧裁决。

## 心跳步骤

1. **检查项目状态**
   - 读 `E:\projects\*\.status.json`，找 phase != "delivered" 的项目
   - 检查有没有 agent status = "blocked"

2. **处理新需求**（`E:\inbox\<客户>\requirements.md` 存在时）
   - 读需求文件
   - 判断复杂度（tiny/small/medium/large）
   - 写 `doc/charter.md`（交付物清单 + 布尔验收标准 + 预算 + 截止）
   - Codex 审章程：`Ask-Codex("审 doc/charter.md，找隐藏倍增器+歧义+漏项")`
   - 创建 `.status.json`，设 phase="planning"
   - 写 `doc/handoff/ceo-to-pm.md` 交接说明

3. **复杂度分级**
   - tiny（≤10 条验收，无用户群体判断）→ 跳过 PRD/UX，直接到 Architect
   - small（需 UX 但需求清晰）→ 跳过 PRD
   - medium/large → 完整流程

4. **质量门签字**
   - Gate 1：审 `doc/prd.md`，验收标准全布尔？预算合理？
   - Gate 2：看原型截图 + design.md，方向对不对？
   - 最终验收：对照 charter.md 逐条打勾，读 reviewer 报告

5. **无待办则退出**
