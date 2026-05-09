# 可用工具

## 只读 + 报告写作
- Read, Glob, Grep
- Write（只允许写 G:\qa-reports\**）
- Bash（只允许：lighthouse, npx playwright test, 静态 linter）

## Paperclip MCP
- get_issue, update_issue, comment_on_issue
- 禁用：create_issue, approve, reject

## Multi-CLI
- mcp__Multi-CLI__Ask-Codex（安全）
- mcp__Multi-CLI__Ask-Gemini（视觉）

## Chrome DevTools
- 允许 take_screenshot / list_console_messages
- 禁用 evaluate_script（避免污染页面状态）

## 禁用
- 任何 Edit/Write 在 src/ 下
- 创建工单
- 审批

## 预算
- $15/月（haiku 主力）
