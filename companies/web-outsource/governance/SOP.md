# SOP 标准操作流程

> 版本 v2.0（2026-05-14）— 文件状态流转版

## 一、新订单接入

### 1. 客户原始材料
放到 `E:\intake\<客户名>\raw\` 下。文件类型不限：
- 微信对话 `chat.txt`
- 邮件原文 `email.eml` 或 `.txt`
- PPT/Word `.pptx` `.docx`
- 草图 `.png` `.jpg`
- 任意笔记

### 2. Watcher 通知（可选）
如果 watcher 在跑（`H:\claude-assets\companies\web-outsource\watcher\start.cmd`），它会在 30 秒内弹窗提示。

### 3. 接单
```
cd H:\claude-assets
claude
> /intake <客户名>
```

intake-analyst 会：
1. 读 raw 下所有材料
2. 抽事实 → 识缺口 → 用 AskUserQuestion 问你 ≤10 题补齐
3. 生成 `E:\projects\<客户名>\doc\requirements.md`
4. 创建 `.status.json`

## 二、启动开发

```
> /go <客户名>
```

父代理（Claude Code 主会话）按以下顺序调子代理：

| Phase | 角色 | 模型 | 跳过条件 |
|-------|------|------|---------|
| 1 | CEO | sonnet | 无 |
| 1.5 | Strategist | sonnet | tiny/small 跳过 |
| 1.7 | CEO 签 Gate 1 | sonnet | tiny/small 跳过 |
| 2 | PM | sonnet | tiny 跳过 |
| 2.5 | UX | sonnet | tiny 跳过 |
| 3 | Architect | **opus** | 无 |
| 3.5 | CEO 签 Gate 2 | sonnet | 无 |
| 4a | Backend | sonnet | 自判（无活秒退） |
| 4b | Frontend | sonnet | 自判（无活秒退） |
| 5 | QA | sonnet | 无 |
| 5.5 | Security Engineer | sonnet | 无 |
| 6 | Reviewer | sonnet | 无 |
| 7 | DevOps | haiku | 无 |
| 8 | PM 收尾 | sonnet | 无 |

复杂度由 CEO 在 charter.md 第一行声明（tiny/small/medium/large）。

### 复杂度跳过矩阵（单一真相源）

| complexity | 跳过的 Phase | 说明 |
|---|---|---|
| tiny | 1.5, 1.7, 2, 2.5 | 直接进 Architect |
| small | 1.5 | 保留 PM + UX |
| medium | 无 | 完整流程 |
| large | 无 | 完整流程 |

**所有引用跳过规则的文件（go.md、pm-planner.md）以此表为准。**

## 三、状态查询

读 `.status.json`：
- `agents.<role>.status` = `pending` / `todo` / `in_progress` / `done` / `reopen` / `blocked`
- `gates.gate1` ~ `gate5` = `pending` / `pass` / `fail` / `warning`
- `phase` = 当前总体阶段

## 四、阻塞处理

### Codex 不可用
按 `codex-prompts.md` 描述的协议：停下来等人工介入，不降级、不跳过。

### Reviewer 退回 Dev
- reviewer 把 `backend.status=reopen` 和/或 `frontend.status=reopen`
- 父代理读 `.status.json` 的 `reopenCount` 字段 +1 写回
- 如果 reopenCount >= 3 → 停下来问用户"是否重设方案/换 Opus/放弃"
- 如果 < 3 → 重新调 Backend → Frontend → QA → Security → Reviewer

### 任何 agent 标记 blocked
父代理在每个 Phase 前检查 .status.json，发现 blocked 立即停下来告诉用户。

## 五、交付

`/go` 流水线 Phase 8 由 PM 收尾：生成 DELIVERY.md + git commit + tag。

## 六、归档

交付后用户确认：
```powershell
Move-Item E:\projects\<客户名> I:\archive\2026\<客户名>
```

## 七、新增子代理（完整 checklist）

1. 在 `C:\Users\23652\.claude\agents\<新角色>.md` 写 frontmatter（name/description/tools/model）
2. 写魂（职责边界 + 不处理什么）+ 心跳流程 + 工具边界 + 失败模式
3. 心跳中 handoff 步骤必须引用 `governance/handoff-schema.md` 格式
4. 在 `H:\claude-assets\.claude\commands\go.md` 加对应 Phase 调用
5. 在 `governance/model-strategy.md` agent 表加一行
6. 在 `governance/SOP.md` Phase 表加一行
7. 在 `governance/init-project.ps1` agents 字段加一行
8. 在 `H:\claude-assets\SYSTEM.md` agent 表加一行
9. 如需 Codex 审查：在 `governance/codex-prompts.md` 加模板
10. 在 `governance/quality-gates.md` 执行者表更新（如涉及 Gate）
11. 在 `lessons/INDEX.md` 按角色表加一行

## 八、新增项目骨架

放到 `H:\claude-assets\skeletons\<骨架名>\` 下。新建项目时：
```powershell
init-project.ps1 -Name myproj -Skeleton <骨架名>
```

## 九、新增可复用片段

放到 `H:\claude-assets\snippets\<片段名>.md` 下。Dev/QA 在 heartbeat 里会扫描这个目录。

## 十、禁忌清单

- ❌ 父代理直接干活（必须 Agent 子代理）
- ❌ 跳过 Codex 双审
- ❌ Charter 写"大概"/"好一点"（必须布尔）
- ❌ 直接改 src/ 的 reviewer/qa（只能开 reopen）
- ❌ Architect 选型不写候选 + 理由 + 风险
- ❌ Dev 用 innerHTML 渲染用户输入
- ❌ DevOps 用 `latest` 镜像标签
- ❌ secrets 写进代码或 dockerfile
