# 多 Agent 公司操作系统 · 架构白皮书

> 版本：v1.0
> 日期：2026-05-09
> 作者：Claude Code（与用户协作构建）
> 状态：已跑通首个 MVP（Personal Blog），可复制

## 文档目录

本白皮书分四个文件：

| 文件 | 谁读 | 内容 |
|------|------|------|
| [`01-overview.md`](./01-overview.md) | **所有人**，第一次接触本系统从这里开始 | 系统是什么、五层架构、核心设计理念 |
| [`02-blueprint.md`](./02-blueprint.md) | **想复制这套系统的人** | 从零搭建的每一步，含命令、目录、文件模板 |
| [`03-runbook.md`](./03-runbook.md) | **日常使用者** | 接单→拆单→实施→验收 的完整工作流，含 API 调用示例 |
| [`04-reference.md`](./04-reference.md) | **想定制 / 扩展的人** | 目录结构、配置字段、Paperclip API、MCP 清单、已知限制 |

## 一句话理解

> 这是一家"跑在文件系统上的虚拟外包公司"。Paperclip 是它的 OA 系统，`H:\claude-assets` 是知识库，五个 soul/heartbeat 定义的 agent 是员工，你是 CEO 兼董事长。每跑一个项目，这家公司就更聪明一点。

## 快速索引

**我想……**

- 了解整体架构 → [01-overview.md § 系统架构图](./01-overview.md#二五层架构图)
- 在新机器上搭一套 → [02-blueprint.md](./02-blueprint.md)
- 接一个新订单跑起来 → [03-runbook.md § 新项目从 0 到交付](./03-runbook.md#一新项目从-0-到交付)
- 新增一个角色（如 backend-dev）→ [04-reference.md § 新增 Agent](./04-reference.md#新增-agent)
- 理解 Soul/Heartbeat 四件套 → [04-reference.md § Agent 四件套](./04-reference.md#agent-四件套)
- Paperclip API 速查 → [04-reference.md § Paperclip API](./04-reference.md#paperclip-rest-api)
- 已知限制与坑 → [04-reference.md § 已知限制](./04-reference.md#已知限制)

## 首次 MVP 产出物（作为参考样例）

- 项目：`E:\projects\personal-blog\`
- 章程：`doc/charter.md` · 计划：`doc/plan.md` · 设计：`doc/design.md` · 验收：`doc/acceptance.md`
- 审查报告：`G:\qa-reports\personal-blog\review-001.md`
- 经验沉淀：`H:\claude-assets\lessons\{pm,frontend-dev,reviewer}.md`

## 复制这套方案需要的条件

- Windows 10/11 + 分区 ≥ 5 个（建议 7 个）
- Node.js 20+
- Claude Code CLI + 订阅
- npm 全局：`paperclipai`
- 管理员权限一次（建软链用）
- 约 2 小时搭建时间
