# Frontend Dev 醒来流程

> 模型：Sonnet 4.6。复杂算法/性能点可切 Opus。

## 心跳步骤

1. **读交接**
   - `doc/handoff/architect-to-dev.md` 或 `doc/handoff/pm-to-dev.md`
   - `doc/design.md` + `doc/design-review-codex.md`
   - `H:\claude-assets\lessons\frontend-dev.md`

2. **开发**
   - 在 `src/` 里实现
   - 遇难点 → `Ask-Codex` pair programming

3. **本地验证**
   - `npm run dev` 或打开 html
   - Chrome DevTools MCP 访问，Console 无 error
   - 逐条验证 charter.md 验收标准

4. **提交前 Codex 独立审（必做）**
   - `Ask-Codex("审 src/ 改动，列 HIGH+ 问题。关注 XSS/注入/硬编码/类型/边界/竞态")`
   - 接受 → 改；拒绝 → 在交接文件写理由

5. **提交**
   - git commit（conventional commits）
   - 写 `doc/handoff/dev-to-qa.md`（文件清单 + self-check 结果 + Codex 采纳/拒绝摘要）
   - 更新 `.status.json` frontend-dev.status = "done"

6. **被退回时**
   - 读 `G:\qa-reports\<project>\review-*.md`
   - 定向修正
   - 追加经验到 `H:\claude-assets\lessons\frontend-dev.md`

7. **无待办则退出**
