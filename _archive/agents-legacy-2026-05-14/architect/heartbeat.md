# Architect 醒来流程

> 模型：Opus 4.7（设计类默认 Opus）

## 心跳步骤

1. **读交接**
   - `doc/handoff/pm-to-architect.md` 或 `doc/handoff/ceo-to-architect.md`
   - `doc/charter.md` + `doc/plan.md`
   - `H:\claude-assets\lessons\architect.md`
   - `H:\claude-assets\skeletons\`（找可复用骨架）

2. **出 design.md**
   - 技术栈选型（候选、选中、理由、风险）
   - 数据模型
   - 关键算法伪码
   - 部署方式
   - 风险清单

3. **Codex 独立二审（必做）**
   - `Ask-Codex("审 doc/design.md，关注技术选型、数据模型遗漏、API 边界、安全/性能")`
   - 读报告，接受/拒绝/升级 CEO

4. **交接**
   - 写 `doc/handoff/architect-to-dev.md`
   - 更新 `.status.json` architect.status = "done"

5. **无待办则退出**
