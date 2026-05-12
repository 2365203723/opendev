# Paperclip API 速查（给新会话用）

> 所有 agent heartbeat 执行时先读此文件，避免重复试错。
> 基于 2026-05-11 实测总结。

## 基础信息

- Base URL: `http://127.0.0.1:3100`
- Company ID: `b891ef9b-de53-49d7-bc3f-81d9db488b0f`
- 无需 auth token（local_trusted 模式）

## Agent IDs

| 角色 | ID | urlKey |
|------|-----|--------|
| CEO | cc75d88d-5dbc-48eb-a079-7f5a73c2125c | ceo |
| PM | 54daeaba-2883-43d9-87aa-936831fbc3a0 | pm-planner |
| Architect | 7648bf06-34d9-4558-aeb1-d0f35f1062af | architect |
| Frontend Dev | 9ef8bc7d-61c1-4c3c-9e91-3b88f77bc45f | frontend-dev |
| Reviewer | 4dd0cc85-ecab-4b88-9aa2-a8dd772f7d4c | reviewer |
| IntakeAnalyst | c41633ec-22bd-4208-8443-4276a13cbc1d | intake |

## 常用操作

### 列工单
```bash
curl -s "http://127.0.0.1:3100/api/companies/{CO}/issues?limit=50"
```
返回数组。每个 issue 有 `id`, `identifier`(WEB-N), `status`, `assigneeAgentId`, `title`, `description`。

### 创建工单
```bash
curl -s -X POST "http://127.0.0.1:3100/api/companies/{CO}/issues" \
  -H 'content-type: application/json' \
  -d '{"title":"...","description":"...","projectId":"...","goalId":"...","assigneeAgentId":"...","reporterAgentId":"...","status":"todo","priority":"high"}'
```

### 更新工单状态
```bash
curl -s -X PATCH "http://127.0.0.1:3100/api/issues/{ISSUE_ID}" \
  -H 'content-type: application/json' \
  -d '{"status":"done"}'
```
**合法 status**: `todo`, `in_progress`, `done`, `cancelled`
**不合法**: `archived`（用 cancelled 代替）

### 工单评论
```bash
curl -s -X POST "http://127.0.0.1:3100/api/issues/{ISSUE_ID}/comments" \
  -H 'content-type: application/json' \
  -d '{"authorAgentId":"...","body":"..."}'
```
**注意**: 字段是 `body` 不是 `content`。

### 创建 Project
```bash
curl -s -X POST "http://127.0.0.1:3100/api/companies/{CO}/projects" \
  -H 'content-type: application/json' \
  -d '{"name":"...","description":"...","status":"in_progress"}'
```
**合法 status**: `backlog`, `planned`, `in_progress`, `completed`, `cancelled`
**不合法**: `active`（用 `in_progress`）

### 创建 Goal
```bash
curl -s -X POST "http://127.0.0.1:3100/api/companies/{CO}/goals" \
  -H 'content-type: application/json' \
  -d '{"title":"...","description":"...","projectId":"...","status":"active"}'
```
**注意**: Goal 的 projectId 创建时绑定，之后 PATCH 改不了。

### 费用查询
```bash
curl -s "http://127.0.0.1:3100/api/companies/{CO}/costs/summary"
```
返回 `{spendCents, budgetCents, utilizationPercent}`。

## 踩坑记录

1. **Project status 不接受 "active"** → 用 `in_progress`
2. **Goal 的 projectId 不可 PATCH** → 创建时就绑对
3. **Comment 字段是 body 不是 content** → 用错会 400
4. **Issue 不支持 DELETE** → 用 PATCH status=cancelled
5. **Agent 创建需要 hire 审批流** → POST agent-hires → POST agents/{id}/approve
6. **中文在 curl JSON 里可能被 shell 截断** → 用英文或确保 UTF-8
7. **Routine trigger POST 路径**: `POST /api/routines/{routineId}/triggers`（不是 /schedules）
