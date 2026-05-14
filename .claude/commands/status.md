# /status — 查看项目状态

接收项目名参数: `$ARGUMENTS`

## 执行步骤

1. 读 `E:\projects\<项目名>\.status.json`
2. 输出摘要（不 spawn 子代理，直接在父会话执行）：

```
项目: <name>
阶段: <phase>
复杂度: <complexity>
Reopen 次数: <reopenCount>

Agent 状态:
  ceo:        done (2026-05-12)
  architect:  in_progress (2026-05-12)
  ...

Gate 状态:
  Gate 1: pass
  Gate 2: pending
  ...

下一步: <当前 status=todo 的角色>
```

3. 如果有 `blockReason`，高亮显示阻塞原因
4. 如果 `reopenCount >= 3`，警告循环返工

## 无项目名时

扫 `E:\projects\*\.status.json`，列出所有活跃项目一行摘要。
