# Web-Outsource Development Pipeline

## Commands

- `/intake <客户名>` — 接入客户需求，生成结构化需求文档
- `/go <客户名>` — 启动开发流水线（CEO → PM → Architect → Backend/Frontend → QA → Security → Reviewer → DevOps → PM收尾）

## Rules

1. **先读 governance 再动手。** `H:\claude-assets\companies\web-outsource\governance\` 下的 `model-strategy.md`、`codex-prompts.md` 是操作手册。
2. **Codex 双审不可跳过。** 6 个强制点：Architect 设计审（模板 A）、Backend/Frontend 提交前审（模板 B）、Reviewer 双盲审（模板 C）为必做；CEO 章程审（模板 E）、PM 拆单审（模板 D）、Strategist PRD 审为 medium+ 必做。
3. **验收标准必须布尔可判定。** "好看" 不行，"首屏加载 < 3s" 可以。
4. **有歧义就问，不要猜。**
5. **经验库要读也要写。** 开始前 grep `H:\claude-assets\lessons\INDEX.md`；完成后有新经验就追加。

## Agent Definitions

`C:\Users\23652\.claude\agents\<role>.md`（12 个子代理）

Each agent has: frontmatter（name/description/tools/model）+ 魂 + 心跳

## Status Tracking

- Project status: `E:\projects\<name>\.status.json`
- Agent logs: `G:\logs\agents\`
- QA reports: `G:\qa-reports\<project>\`
- Handoff files: `E:\projects\<name>\doc\handoff\<from>-to-<to>.md`

## Watcher (optional background notifier)

`H:\claude-assets\companies\web-outsource\watcher\start.cmd` — monitors E:\inbox\ for new .txt files, pops a notification when detected. Execution still happens here in Claude Code.
