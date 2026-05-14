# /resume — 从阻塞恢复项目

接收项目名参数: `$ARGUMENTS`

## 前置条件

- `E:\projects\<项目名>\.status.json` 必须存在
- 至少一个 agent 的 status 为 `blocked` 或 `reopen`

## 执行步骤

1. 读 `.status.json`
2. 找到所有 `status=blocked` 的 agent，列出 blockReason
3. 问用户选择恢复方式：
   - "Codex 已恢复，继续流程" → 把 blocked agent 改为 todo，继续 /go
   - "跳过 Codex 审（用户授权）" → 标 warning，继续
   - "重设方案（回到 Architect）" → 把 architect 及后续全部改为 pending
   - "放弃项目" → 标 phase=abandoned
4. 如果是 `reopen` 状态：
   - 显示 reopenCount 和最近的 review 报告路径
   - 问用户是否继续修复还是重设方案
5. 执行用户选择后，提示"输入 `/go <项目名>` 继续流水线"
