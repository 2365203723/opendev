# 状态追踪

## 项目状态文件

每个项目根目录有 `.status.json`：

```json
{
  "project": "url-shortener",
  "phase": "build",
  "complexity": "tiny",
  "reopenCount": 0,
  "agents": {
    "ceo": { "status": "done", "lastRun": "2026-05-12T10:00:00Z" },
    "pm": { "status": "done", "lastRun": "2026-05-12T10:30:00Z" },
    "architect": { "status": "done", "lastRun": "2026-05-12T11:00:00Z" },
    "backend": { "status": "in_progress", "lastRun": "2026-05-12T12:00:00Z" },
    "frontend": { "status": "pending" },
    "qa": { "status": "pending" },
    "security": { "status": "pending" },
    "reviewer": { "status": "pending" },
    "devops": { "status": "pending" }
  },
  "gates": {
    "gate1": "pass",
    "gate2": "pass",
    "gate3": "pending",
    "gate4": "pending",
    "gate5": "pending"
  },
  "createdAt": "2026-05-12T09:00:00Z",
  "updatedAt": "2026-05-12T12:00:00Z"
}
```

## 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| project | string | 项目名 |
| phase | string | 当前总体阶段：intake/planning/design/build/polish/ship/delivered |
| complexity | string | tiny/small/medium/large/unknown |
| reopenCount | number | Reviewer 退回次数，≥3 触发父代理停下来问用户 |
| agents.<role>.status | string | pending/todo/in_progress/done/reopen/blocked |
| agents.<role>.lastRun | ISO8601 | 最后执行时间 |
| agents.<role>.blockReason | string? | 仅 blocked 时填写原因 |
| gates.gate1-5 | string | pending/pass/fail/warning |

## Agent 交接

Agent 完成后：
1. 更新 `.status.json` 中自己的 status 为 "done"
2. 在 `doc/handoff/<from>-to-<to>.md` 写交接说明
3. 下一个 agent 启动时读 `.status.json` 确认前置已完成

## 日志

每次 agent 执行写日志到 `G:\logs\agents\<project>-<agent>-<timestamp>.log`

## 设计原则

- 单人团队不需要工单系统的协作功能
- 文件系统状态更直观、可 git 追踪
- 减少每个 agent 的 token 消耗（不需要调外部 API）
