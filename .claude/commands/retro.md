# /retro — 项目复盘

接收项目名参数: `$ARGUMENTS`

## 前置条件

- `E:\projects\<项目名>\.status.json` 存在且 `phase = "delivered"` 或 `"abandoned"`

## 执行步骤（不 spawn 子代理，直接在父会话执行）

1. 读 `.status.json`
2. 读所有 `doc\handoff\*.md`
3. 读 `G:\qa-reports\<项目名>\*.md`
4. 读 `doc\acceptance-matrix.md`（如存在）
5. 产出复盘报告 `E:\projects\<项目名>\doc\retro.md`：

```markdown
# <项目名> 复盘

## 基本信息
- 复杂度: <complexity>
- Reopen 次数: <reopenCount>
- 总 Phase 数: <实际执行的 Phase 数>

## 做得好的
- (从 handoff 和 review 报告中提取正面信号)

## 踩坑
- (从 reopen 原因、Codex CRITICAL、security FAIL 中提取)

## 可迁移经验（≤5 条）
1. ...

## 数据
- Gate 通过情况: 1/2/3/4/5 = pass/pass/pass/pass/pass
- 测试覆盖率: (从 QA 报告读)
- Lighthouse 分数: (从 QA 报告读)
- 安全审计结果: (从 security-review.md 读)
```

6. 从"可迁移经验"中挑 ≤3 条追加到 `H:\claude-assets\lessons\` 对应角色文件
7. 更新 `H:\claude-assets\lessons\INDEX.md`
8. 告诉用户复盘完成，报告路径
