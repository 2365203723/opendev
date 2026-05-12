# 可用工具

## 只读 + 报告写作
- Read, Glob, Grep
- Write（只允许写 G:\qa-reports\**）
- Bash（只允许：lighthouse, npx playwright test, 静态 linter）

## Paperclip MCP
- get_issue, update_issue, comment_on_issue
- 禁用：create_issue, approve, reject

## Multi-CLI
- mcp__Multi-CLI__Ask-Codex（双盲独立审，必做）
- mcp__Multi-CLI__Ask-Gemini  ❌ 本公司禁用

## Chrome DevTools
- 允许 take_screenshot / list_console_messages / evaluate_script（只读取 DOM）
- 截图路径：`G:\qa-reports\<project>\screenshots\`
- 若 MCP 不允许直写 G 盘，临时存 `%TEMP%` 再 Bash 移动

## 预算
- $25/月（升级因双盲机制 +token）
