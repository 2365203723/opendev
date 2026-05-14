# 跨文件约定（Conventions）

> 本文件列出所有分散在各文件中的隐性约定，新 Claude 会话必读。

## charter.md 头部格式

```
complexity: tiny|small|medium|large
mvp: true|false
```

- 第一行必须是 complexity
- 第二行必须是 mvp
- CEO 写，PM/QA/Reviewer 读

## .status.json 状态机

```
pending → todo → in_progress → done
                              → reopen（被退回）
                              → blocked（Codex 不可用等）
```

- `pending`：初始状态，还没轮到
- `todo`：上游完成，轮到你了
- `in_progress`：正在执行
- `done`：完成
- `reopen`：被下游退回，需要重做
- `blocked`：外部依赖不可用，需人工介入

转换规则：
- 只有上游 agent 可以把下游改为 `todo`
- 只有自己可以把自己改为 `in_progress` / `done`
- 只有下游 agent 或 reviewer 可以把上游改为 `reopen`
- 只有自己可以把自己改为 `blocked`

## Codex 模型字符串

```
model: "gpt-5.5-codex"
```

固定值，不在 List-Codex-Models 输出中也可强制传入。不降级。

## Handoff 文件

- 路径：`doc/handoff/<from>-to-<to>.md`
- 格式：见 `governance/handoff-schema.md`（6 字段强制）
- 命名：角色名用 kebab-case（如 `security-to-reviewer.md`）

## QA 报告命名

```
G:\qa-reports\<项目名>\qa-<YYYYMMDD-HHmm>.md
G:\qa-reports\<项目名>\review-<YYYYMMDD-HHmm>.md
G:\qa-reports\<项目名>\security-review.md
G:\qa-reports\<项目名>\security-review-codex.md
```

## Lessons 文件

- 按角色：`H:\claude-assets\lessons\<role>.md`
- 按主题：`H:\claude-assets\lessons\<YYYYMMDD>-<slug>.md`
- 索引：`H:\claude-assets\lessons\INDEX.md`（agent 启动时 grep）

## 日志路径

```
G:\logs\agents\<project>-<agent>-<timestamp>.log
G:\logs\dashboard\dashboard-<YYYYMMDD>.md
```

## Codex 输出统一格式

所有 Codex 模板输出必须包含：
```
## VERDICT: <value>
## CRITICAL
## HIGH
## MEDIUM
## SUMMARY
```

下游用 `grep "^## VERDICT"` 解析。
