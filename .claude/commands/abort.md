# /abort — 终止项目

接收项目名参数: `$ARGUMENTS`

## 执行步骤

1. 读 `E:\projects\<项目名>\.status.json`
2. 显示当前状态摘要
3. 问用户确认："确定要终止项目 <项目名> 吗？已完成的产出会保留。"
4. 用户确认后：
   - 更新 `.status.json`：`phase = "abandoned"`
   - 所有 `in_progress` / `todo` 的 agent 改为 `pending`
   - 写 `doc\handoff\abort-reason.md`：终止原因（问用户）
5. 告诉用户：
   - 项目已终止
   - 产出保留在 `E:\projects\<项目名>\`
   - 如需归档：`Move-Item E:\projects\<项目名> I:\archive\2026\<项目名>-abandoned`
