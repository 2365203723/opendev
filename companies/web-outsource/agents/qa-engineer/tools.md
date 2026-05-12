# 工具（QA Engineer）

## 文件
- Read, Glob, Grep（读任何项目文件）
- Write（只写 tests/*, doc/test-strategy.md, G:\qa-reports\*）
- Edit（只改 tests/*, package.json 的 scripts/devDependencies 节）

## Bash（核心工具）
- npm test, npx vitest, npx jest（跑测试）
- npx playwright test（E2E）
- npx lighthouse（性能）
- npx axe（可访问性）
- npm audit（安全）
- npm run lint（代码规范）
- curl（API 冒烟测试）
- 禁止：rm -rf, git push, 修改 src/ 业务代码

## Paperclip MCP
- get_issue, update_issue, comment_on_issue
- create_issue（只创建 bug 工单给 Dev）
- 禁止：approve, reject

## Multi-CLI
- mcp__Multi-CLI__Ask-Codex（Gate 3 双盲，gpt-5.5）
- mcp__Multi-CLI__Ask-Gemini ❌ 公司禁用

## Chrome DevTools MCP
- lighthouse_audit（性能/可访问性）
- take_screenshot（视觉回归基线）
- list_console_messages（检查运行时错误）
- evaluate_script（DOM 断言）

## 禁写
- src/（业务代码由 Dev 改，我只写 tests/）
- doc/design.md, doc/prd.md（不是我的产出）
- 其他 agent 的文件

## 预算
- $15/月
