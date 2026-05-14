---
name: system-orientation
description: 新会话冷启动必读。30 秒内理解整个系统的地图、角色、工作流和关键路径。
---

# web-outsource 系统地图

> 读完这份文件，你就知道"我在哪、该做什么、去哪找东西"。

## 这是什么

一家虚拟外包公司的 AI agent 流水线。客户把需求扔进 intake，11 个 agent 接力完成接单→设计→开发→质检→交付，状态通过 `.status.json` + `doc/handoff/` 文件追踪。

## 关键路径

```
E:\intake\<客户>\raw\              ← 客户原始材料（chat.txt/PPT/邮件等）
E:\intake\<客户>\work\             ← intake-analyst 工作目录
E:\projects\<项目>\                ← 项目工作目录
  .status.json                     ← 项目状态（agent 流转 + Gate 状态）
  doc\requirements.md              ← intake 产出的结构化需求
  doc\charter.md                   ← CEO 写的章程（布尔验收标准）
  doc\prd.md                       ← Strategist 写的 PRD（medium+ 才有）
  doc\design.md                    ← Architect 写的技术方案
  doc\design-review-codex.md       ← Codex 审稿
  doc\plan.md                      ← PM 拆的任务依赖图
  doc\ux\                          ← UX 产出
  doc\handoff\<from>-to-<to>.md   ← 交接文件
  src\                             ← Dev 写的代码
G:\qa-reports\<项目>\              ← QA/Reviewer 报告
H:\claude-assets\                  ← 所有可复用资产
  companies\web-outsource\
    governance\                    ← 操作手册（codex-prompts、SOP、quality-gates）
    scripts\                       ← 工具脚本
    watcher\                       ← inbox 监控通知器
  lessons\                         ← 跨项目经验库
  skeletons\                       ← 可复用项目骨架
  snippets\                        ← 可复用代码片段
I:\archive\                        ← 已交付项目归档
```

## 12 个 Agent 职责

子代理定义在 `C:\Users\23652\.claude\agents\<role>.md`，frontmatter 含模型分配。

| Agent | 模型 | 职责 |
|---|---|---|
| intake-analyst | sonnet | 把杂乱原始材料压成 requirements.md |
| ceo | sonnet | 写章程、判定复杂度、Gate 签字、最终验收 |
| product-strategist | sonnet | 竞品分析、PRD（仅 medium/large） |
| pm-planner | sonnet | 拆任务、画依赖图、项目收尾（DELIVERY + lessons + 看板） |
| ux-designer | sonnet | 用户旅程、HTML 原型 |
| **architect** | **opus** | 技术选型、数据模型、API 契约 |
| frontend | sonnet | 前端实现（HTML/CSS/JS/React） |
| backend | sonnet | 后端实现（API/DB/Auth） |
| qa-engineer | sonnet | 自动化测试、覆盖率 |
| security-engineer | sonnet | 安全审计（OWASP/渗透/依赖审计） |
| reviewer | sonnet | 代码+视觉+性能双盲审查 |
| **devops** | **haiku** | Dockerfile、部署 |

## 工作流

用户触发：
- `/intake <客户>` — 在父会话执行 intake，与用户交互问问题
- `/go <项目>` — 父代理按顺序调 Agent tool 跑流水线（详见 `H:\claude-assets\.claude\commands\go.md`）

每个 Phase 结束后：
- 子代理更新 `.status.json` 中自己的 status
- 子代理写 `doc\handoff\<role>-to-<next>.md`
- 父代理读 status 决定调下一个

## 操作手册位置

- Codex 调用模板：`H:\claude-assets\companies\web-outsource\governance\codex-prompts.md`
- 模型策略：`H:\claude-assets\companies\web-outsource\governance\model-strategy.md`
- 质量门标准：`H:\claude-assets\companies\web-outsource\governance\quality-gates.md`
- 状态追踪规范：`H:\claude-assets\companies\web-outsource\governance\status-tracking.md`
