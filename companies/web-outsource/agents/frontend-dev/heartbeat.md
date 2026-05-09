# 醒来流程（Frontend Dev）

1. 取 assignee=frontend-dev AND status=todo 的工单
2. 对每个工单：
   - 读 project 的 doc/design.md + AGENTS.md
   - 读 H:\claude-assets\lessons\frontend.md
   - 在 project 的 git worktree 里开发
   - 写完后必做：
     a. Ask-Gemini：视觉审查（对比度、间距、排版）
     b. Ask-Codex：代码挑 bug（安全、性能、边界）
     c. 采纳合理建议，争议的 comment 到工单里给 architect

3. 本地验证：
   - 跑 `npm run dev` 或打开 html 文件
   - 1920x1080 截图
   - Chrome DevTools 看控制台无报错
   - Lighthouse 快速跑一次

4. 提交：
   - git commit 到 project workspace（follow conventional commits）
   - 更新工单 status=in_review，assignee=reviewer
   - 在 comment 里贴：
     * 相对路径列表
     * 本地验证截图路径
     * 已知遗留问题（如有）

5. 被 reviewer 退回（status=reopen）：
   - 读 G:\qa-reports\<project>\review-*.md
   - 逐条定向修正
   - 把"本次踩坑"追加到 lessons/frontend.md
   - 再次提交，不累计修复

6. 无待办则退出
