# Gate Check Scripts

每个 Gate 一个 PowerShell 脚本。接收项目路径，输出 JSON 报告。

## 用法

```powershell
# 单 Gate 检查
H:\claude-assets\companies\web-outsource\governance\gate-scripts\gate-check.ps1 -Project E:\projects\personal-blog -Gate 3

# 全部 Gate 扫（对 done 状态项目做健康体检）
H:\claude-assets\companies\web-outsource\governance\gate-scripts\gate-check.ps1 -Project E:\projects\personal-blog -Gate all
```

## 输出

- 控制台：彩色 PASS/FAIL 摘要
- 文件：`G:\qa-reports\<project>\gate-<N>-<timestamp>.json`

## 脚本清单

| Gate | 文件 | 自动化程度 |
|------|------|-----------|
| 1 | `gate-check.ps1 -Gate 1` | 高（文件存在 + 段落解析）|
| 2 | `gate-check.ps1 -Gate 2` | 中（文件存在，原型审查需人工）|
| 3 | `gate-check.ps1 -Gate 3` | 高（跑 npm test / lint / audit）|
| 4 | `gate-check.ps1 -Gate 4` | 中（Lighthouse 自动，视觉需 Reviewer）|
| 5 | `gate-check.ps1 -Gate 5` | 中（docker build 自动，回滚需 DevOps 确认）|

## 判定规则

- 所有检查项 PASS → `verdict: PASS`
- 任何 BLOCKER 项 FAIL → `verdict: BLOCK`
- 非 BLOCKER 项 FAIL + 无 BLOCKER → `verdict: PASS_WITH_WARNINGS`

## 在 Agent heartbeat 中的使用

- **CEO**：Gate 1 签字前先跑脚本，FAIL 立即退回 Product Strategist
- **PM**：Gate 2 前跑，FAIL 找对应责任人
- **QA**：Gate 3 自己跑自己报告
- **Reviewer**：Gate 4 跑，结合视觉审查合议
- **DevOps**：Gate 5 跑，FAIL 不交付
