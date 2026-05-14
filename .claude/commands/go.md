# /go — 启动开发流水线

接收客户名参数: `$ARGUMENTS`

## 强制规则（你是父代理，必读）

**你不能自己执行任何 Phase。** 你的唯一职责：

1. 检查前置条件
2. 检查阻塞状态
3. 按顺序调用 Agent tool（subagent_type 指定子代理）
4. 在每个 Agent 完成后向用户简报 1 句话
5. 遇到阻塞停下来问用户

**违反规则的表现（必须避免）**：
- 你自己写 charter.md / design.md / src/ / DELIVERY.md ← 错！
- 你自己跑 Ask-Codex ← 错！
- 你自己执行 git commit ← 错！

**正确模式**：每个 Phase 都用 Agent tool 调子代理。

## 前置条件

执行前先检查：
- `E:\projects\<客户名>\doc\requirements.md` 必须存在
- `E:\projects\<客户名>\.status.json` 必须存在

如有任一缺失：告诉用户先跑 `/intake <客户名>`，然后停。

## 阻塞检查（每个 Phase 前必做）

每次调子代理前：
1. 读 `.status.json`
2. 如果任何 `agents.<role>.status = "blocked"` → 停下来告诉用户哪个角色被阻塞、blockReason 是什么，等用户指示
3. 如果 `reopenCount >= 3` → 停下来问用户"循环返工已达 3 次，是否：重设方案 / 换 Opus 重做 / 放弃"

## 复杂度跳过规则

**单一真相源：`governance/SOP.md` 复杂度跳过矩阵。**

| complexity | 跳过的 Phase |
|---|---|
| tiny | Strategist, PM, UX, Gate 1 签字 |
| small | Strategist |
| medium | 无 |
| large | 无 |

CEO 在 Phase 1 写 charter 时在第一行声明 `complexity: tiny|small|medium|large`。
父代理读 `.status.json` 的 `complexity` 字段决定跳过。

## Phase 执行顺序

### Phase 1: CEO

```
Agent({
  subagent_type: "ceo",
  prompt: "项目名: <客户名>\n项目目录: E:\\projects\\<客户名>\n按你的 heartbeat 流程执行 CEO 角色（写章程、Codex 审、判断复杂度）。完成后更新 .status.json。"
})
```

完成后读 .status.json 看 `complexity` 字段。

### Phase 1.5: Strategist（仅 medium/large）

```
Agent({ subagent_type: "product-strategist",
  prompt: "项目名: <客户名>\n项目目录: E:\\projects\\<客户名>\n按你的 heartbeat 写 PRD。handoff 按 governance/handoff-schema.md 格式。" })
```

### Phase 1.7: CEO 签 Gate 1（仅 medium/large）

```
Agent({ subagent_type: "ceo",
  prompt: "项目名: <客户名>\n项目目录: E:\\projects\\<客户名>\n审 doc/prd.md，签 Gate 1。更新 .status.json gates.gate1。" })
```

### Phase 2: PM（tiny 跳过）

```
Agent({ subagent_type: "pm-planner",
  prompt: "项目名: <客户名>\n项目目录: E:\\projects\\<客户名>\n按你的 heartbeat 拆任务，写 plan.md。handoff 按 governance/handoff-schema.md 格式。" })
```

### Phase 2.5: UX（tiny 跳过）

```
Agent({ subagent_type: "ux-designer",
  prompt: "项目名: <客户名>\n项目目录: E:\\projects\\<客户名>\n按你的 heartbeat 出 UX 原型。handoff 按 governance/handoff-schema.md 格式。" })
```

### Phase 3: Architect

```
Agent({ subagent_type: "architect",
  prompt: "项目名: <客户名>\n项目目录: E:\\projects\\<客户名>\n按你的 heartbeat 写 design.md，必做 Codex 二审。handoff 按 governance/handoff-schema.md 格式。" })
```

完成后告诉用户："Architect 完成。Codex 审查报告在 doc/design-review-codex.md。" 等用户确认继续。

### Phase 3.5: CEO 签 Gate 2

```
Agent({ subagent_type: "ceo",
  prompt: "项目名: <客户名>\n项目目录: E:\\projects\\<客户名>\n审 doc/design.md + doc/ux/（如有），签 Gate 2。更新 .status.json gates.gate2。" })
```

### Phase 4a: Backend

```
Agent({ subagent_type: "backend",
  prompt: "项目名: <客户名>\n项目目录: E:\\projects\\<客户名>\n按你的 heartbeat 实现后端。自判是否有活，无活秒退写 handoff。handoff 按 governance/handoff-schema.md 格式。" })
```

### Phase 4b: Frontend

```
Agent({ subagent_type: "frontend",
  prompt: "项目名: <客户名>\n项目目录: E:\\projects\\<客户名>\n按你的 heartbeat 实现前端。自判是否有活，无活秒退写 handoff。handoff 按 governance/handoff-schema.md 格式。" })
```

### Phase 5: QA

```
Agent({ subagent_type: "qa-engineer",
  prompt: "项目名: <客户名>\n项目目录: E:\\projects\\<客户名>\n按你的 heartbeat 写测试，跑 Gate 3+4。handoff 按 governance/handoff-schema.md 格式。" })
```

### Phase 5.5: Security Engineer

```
Agent({ subagent_type: "security-engineer",
  prompt: "项目名: <客户名>\n项目目录: E:\\projects\\<客户名>\n按你的 heartbeat 做安全审计。handoff 按 governance/handoff-schema.md 格式。" })
```

### Phase 6: Reviewer

```
Agent({ subagent_type: "reviewer",
  prompt: "项目名: <客户名>\n项目目录: E:\\projects\\<客户名>\n按你的 heartbeat 双盲审查。handoff 按 governance/handoff-schema.md 格式。" })
```

**Reopen 处理**：
读 .status.json，如果 reviewer 标记了 reopen：
1. 读 `reopenCount` 字段，+1 写回
2. 如果 reopenCount >= 3 → 停下来问用户
3. 如果 < 3 → 回到 Phase 4a 重跑 Backend → Frontend → QA → Security → Reviewer

### Phase 7: DevOps

```
Agent({ subagent_type: "devops",
  prompt: "项目名: <客户名>\n项目目录: E:\\projects\\<客户名>\n按你的 heartbeat 容器化交付。handoff 按 governance/handoff-schema.md 格式。" })
```

### Phase 8: PM 收尾

```
Agent({ subagent_type: "pm-planner",
  prompt: "项目名: <客户名>\n项目目录: E:\\projects\\<客户名>\n执行收尾任务：写 DELIVERY.md、git commit+tag、抽 lessons。" })
```

完成后告诉用户：项目完成，DELIVERY.md 路径，启动命令。

## Codex 强制点（6 个）

| 角色 | 模板 | 条件 |
|------|------|------|
| CEO | E | 必做 |
| Strategist | 自定义 | 仅 medium+ |
| PM | D | 仅 medium+ |
| Architect | A | **必做** |
| Backend/Frontend | B | **必做** |
| Reviewer | C | **必做** |

tiny/small 项目：CEO/PM/Strategist 的 Codex 审为可选。

## 模型成本说明

| 子代理 | 模型 |
|-------|------|
| ceo | sonnet |
| pm-planner | sonnet |
| product-strategist | sonnet |
| ux-designer | sonnet |
| architect | **opus** |
| frontend | sonnet |
| backend | sonnet |
| qa-engineer | sonnet |
| security-engineer | sonnet |
| reviewer | sonnet |
| devops | **haiku** |
