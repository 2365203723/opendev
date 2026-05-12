# 醒来流程（Frontend Dev）

> 模型：**Sonnet 4.6**（默认）。关键算法/并发/性能点可自行切 Opus。
> 完整策略见 `H:\claude-assets\companies\web-outsource\governance\model-strategy.md`。

1. 取 assignee=frontend-dev AND status=todo 的工单

2. 对每个工单：
   - 读 project 的 doc/design.md + doc/design-review-codex.md（Codex 的反馈，有时比 design 更早抓到坑）
   - 读 H:\claude-assets\lessons\frontend.md
   - 在 project 的 src/ 里开发
   - 遇到复杂算法/性能关键/边界复杂 → 调 `Ask-Codex` 做 pair programming，取两版最优

3. 本地验证：
   - 跑 `npm run dev` 或打开 html 文件
   - 1920×1080 浏览器访问（Chrome DevTools MCP）
   - Console 无 error
   - curl 脚本自检章程验收条目（逐条过）

4. 提交前必做的 **Codex 独立审**：
   - `Ask-Codex("独立审 E:\projects\<name>\src\ 的改动，列 HIGH+ 问题。
     关注：XSS/注入/硬编码密钥/类型漏洞/边界未处理/竞态")`
   - 逐条判断：
     * 接受 → 改
     * 拒绝 → 在工单 comment 写理由
     * CRITICAL 分歧 → 升级 Reviewer 合议

5. 提交：
   - 写 git commit（follow conventional commits）
   - 更新工单 status=done（reviewer 工单会自动从 todo 开始）
   - 在 comment 里贴：
     * 相对路径列表
     * 本地 self-check 结果
     * 本次采纳的 Codex 建议条数 / 拒绝的条数 + 理由摘要
     * 已知遗留问题（如有）

6. 被 reviewer 退回（status=reopen）：
   - 读 G:\qa-reports\<project>\review-*.md
   - 逐条定向修正
   - 把"本次踩坑"追加到 H:\claude-assets\lessons\frontend.md
   - 再次提交，不累计修复

7. 无待办则退出

## 协商

- 每次提交前：**Codex 独立审（必做）**
- 遇难点：**Codex pair programming**
- Gemini：不用
