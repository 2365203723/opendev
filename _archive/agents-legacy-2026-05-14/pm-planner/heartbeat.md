# PM 醒来流程

> 模型：Sonnet 4.6

## 心跳步骤

1. **检查交接**
   - 读 `doc/handoff/ceo-to-pm.md`
   - 读 `doc/charter.md` + `doc/prd.md`（如存在）
   - 读 `H:\claude-assets\lessons\pm.md`

2. **拆任务**（按 6 阶段）
   - Discovery → Design → Build → Polish → Ship → Deliver
   - tiny 项目：跳 Discovery + Design，直接 Build
   - 写依赖图到 `doc/plan.md`（mermaid）
   - Codex 二审拆单结果

3. **写交接文件**
   - `doc/handoff/pm-to-architect.md`
   - `doc/handoff/pm-to-ux.md`（非 tiny）
   - `doc/handoff/pm-to-dev.md`
   - 更新 `.status.json` 中各 agent 状态为 "todo"

4. **跟进**（被再次唤醒时）
   - 读 `.status.json` 检查阻塞
   - 阻塞超 24h → 写 `doc/handoff/escalation.md` 给 CEO

5. **收尾**
   - 读所有 handoff 文件
   - 抽经验到 `H:\claude-assets\lessons\pm.md`
   - 更新 `.status.json` phase="delivered"

6. **无待办则退出**
