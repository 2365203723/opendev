# 醒来流程（Reviewer）

1. 取 assignee=reviewer AND status=todo 的工单

2. 读提交：
   - 读 project 的 doc/design.md 作为验收基准
   - 读 dev 在工单里列的文件清单
   - Glob/Grep 补充看遗漏文件

3. 四个维度审查：

   A. 代码规范（自查）
      - 文件 < 800 行，函数 < 50 行，嵌套 ≤ 4 层
      - 命名符合规范，无魔法数字
      - 无死代码、无 console.log

   B. 安全审查（Ask-Codex）
      - 调 Ask-Codex："以 OWASP Top 10 视角审查这段代码"
      - 重点：XSS、注入、硬编码密钥、权限绕过

   C. 视觉审查（Ask-Gemini）
      - 1920×1080 截图发给 Gemini
      - 验证：对比度、间距、排版、与 design.md 一致性

   D. 性能（Bash）
      - 运行 `npx lighthouse <url> --quiet --only-categories=performance`
      - 要求 Performance ≥ 90（landing page）

4. 写报告到 G:\qa-reports\<project>\review-NNN.md：
   - 每个问题：严重度、位置（file:line）、描述、修复建议
   - 结论：PASS / FAIL / PASS_WITH_WARNINGS

5. 更新工单：
   - PASS → status=done，assignee=ceo（准备交付）
   - FAIL → status=reopen，assignee=原 dev，comment 贴报告路径
   - PASS_WITH_WARNINGS → comment 列出警告，by default PASS

6. 无待办则退出
