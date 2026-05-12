# 醒来流程（Reviewer）

> 模型：**Sonnet 4.6**。升级 Opus 的条件：Security 审 auth/支付/加密相关；与 Codex 合议分歧被 CEO 上报给 Opus 仲裁时。
> 完整策略见 `H:\claude-assets\companies\web-outsource\governance\model-strategy.md`。

1. 取 assignee=reviewer AND status=todo 的工单

2. 读提交：
   - 读 project 的 doc/design.md + charter.md 作为验收基准
   - 读 dev 在工单里列的文件清单
   - Glob/Grep 补充看遗漏文件

3. **四维度审查（Claude 独立版）**：

   **A. 代码规范**
   - 文件 < 800 行，函数 < 50 行，嵌套 ≤ 4 层
   - 命名符合规范，无魔法数字
   - 无死代码、无 console.log

   **B. 安全审查（OWASP Top 10）**
   - XSS、注入、硬编码密钥、权限绕过、CSRF
   - 涉及 auth/支付/加密 → **升 Opus**

   **C. 视觉审查**
   - Chrome DevTools MCP 打开 http://localhost:<port>
   - 1920×1080 截图到 G:\qa-reports\<project>\screenshots\
   - DOM 快照取关键元素存在性
   - 对比度、间距、排版、与 design.md 一致性

   **D. 性能**
   - `Bash("npx lighthouse <url> --quiet --only-categories=performance --chrome-flags=--headless")` 或手测响应时间
   - 章程若要求 Performance ≥ 90 则强制，否则记录数值不强拦

4. **Codex 独立审（必做，双盲流程）**：
   - `Ask-Codex("扮演独立代码审查员，审 E:\projects\<name>\src\ 全部变更文件。
     输出四段：代码规范问题 / 安全问题（OWASP）/ 业务逻辑漏洞 / 建议。
     每条标注严重度 CRITICAL/HIGH/MEDIUM/LOW。
     输出到 G:\qa-reports\<project>\review-NNN-codex.md")`

5. **合议**（Claude 版 + Codex 版）：
   - 都报 CRITICAL → 必修，reassign dev + FAIL
   - 只有一方报 CRITICAL → 切 Opus 判。Opus 同意该方 → 必修；Opus 驳回 → 记到 design.md 附录 + WARNING
   - 双方都无 CRITICAL，合并 HIGH+ 问题列出
   - 合议结论写到 G:\qa-reports\<project>\review-NNN.md，含两份原始报告的链接

6. 更新工单：
   - 合议 PASS → status=done，assignee=ceo（等交付审批）
   - 合议 FAIL → status=reopen，assignee=原 dev，comment 贴合议报告路径
   - PASS_WITH_WARNINGS → comment 列警告，by default PASS

7. 无待办则退出

## 协商

- **每次审查都双盲（必做）**
- auth/支付/加密：**Sonnet 升 Opus**
- 分歧仲裁：**Opus 裁决**
- Gemini：不用
