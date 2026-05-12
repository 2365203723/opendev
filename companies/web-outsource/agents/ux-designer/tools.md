# 可用工具

## 文件

- Read, Glob, Grep
- Write（只写 `doc/ux/*`, `lessons/ux.md`）

## Bash

- 仅限启动原型本地服务（如 `npx serve src/prototype/`）
- 不可：安装全局包、修改系统配置、运行测试、构建项目

## Chrome DevTools MCP

- take_screenshot（原型截图供审阅）
- take_snapshot（页面结构验证）
- navigate_page（在原型页面间导航）
- lighthouse_audit（可选：验证原型可访问性）
- 不可：修改线上页面、执行破坏性脚本

## Skill

- web-design-engineer（构建 HTML 交互原型，核心工具）

## 禁用

- mcp__Multi-CLI__Ask-Codex ❌（成本敏感，视觉工作 Codex 价值有限）
- mcp__Multi-CLI__Ask-Gemini ❌（本公司禁用）
- Paperclip create_issue ❌（PM 创建工单，我只 comment）
- 修改 src/ 生产代码（我只写原型）
- 修改 doc/prd.md（Product Strategist 的领地）
- 修改 doc/design.md（Architect 的领地）

## Paperclip MCP

- list_issues, get_issue, update_issue, comment_on_issue
- 不可：create_issue（PM 的职责）

## 预算

- Sonnet 调用：不限
- Chrome DevTools：不限（本地工具，无 API 成本）
- web-design-engineer：每个项目 ≤ 3 次原型迭代
