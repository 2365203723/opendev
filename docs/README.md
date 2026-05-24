# web-outsource 系统文档

> 版本 v2.0（2026-05-14）— 文件状态流转版

## 一、这是什么

一家"跑在文件系统上的"虚拟外包公司。客户把原始材料放到 `E:\intake\<客户>\raw\`，11 个 Claude 子代理通过 `/intake` 和 `/go` 命令接力完成接单→设计→开发→质检→交付。

**任务流转方式**：
- ✅ 使用 `.status.json` + `doc\handoff\` 文件流转

## 二、入口

| 命令 | 作用 | 在哪定义 |
|------|------|---------|
| `/intake <客户名>` | 接入客户原始需求 → 出 requirements.md | `H:\claude-assets\.claude\commands\intake.md` |
| `/go <项目名>` | 启动开发流水线 | `H:\claude-assets\.claude\commands\go.md` |

使用方式：
```
cd H:\claude-assets
claude
> /intake zhangsan
> /go zhangsan
```

## 三、子代理

定义在 `C:\Users\23652\.claude\agents\<role>.md`（12 个），frontmatter 含模型分配。详见 `H:\claude-assets\SYSTEM.md`。

Handoff 文件格式：`governance\handoff-schema.md`（强标准，6 字段必填）。

## 四、关键路径

```
E:\intake\<客户>\raw\          原始材料入口
E:\intake\<客户>\work\         intake-analyst 工作目录
E:\projects\<项目>\            项目目录
  .status.json                 状态机（agent 流转 + Gate 状态）
  doc\
    requirements.md            intake 产出
    charter.md                 CEO 写
    prd.md                     Strategist 写（medium+）
    design.md                  Architect 写
    plan.md                    PM 写
    handoff\<from>-to-<to>.md  交接文件
  src\                         Dev 写代码
G:\qa-reports\<项目>\          QA/Reviewer 报告
H:\claude-assets\              本资产库
  companies\web-outsource\
    governance\                操作手册
    scripts\                   工具脚本
    watcher\                   inbox 通知器
  lessons\                     跨项目经验库
  skeletons\                   可复用项目骨架
  snippets\                    可复用代码片段
I:\archive\                    交付项目归档
```

## 五、操作手册

- 模型策略：`companies\web-outsource\governance\model-strategy.md`
- Codex 调用：`companies\web-outsource\governance\codex-prompts.md`
- 质量门：`companies\web-outsource\governance\quality-gates.md`
- 状态追踪：`companies\web-outsource\governance\status-tracking.md`

## 六、新建项目

```powershell
H:\claude-assets\companies\web-outsource\governance\init-project.ps1 -Name myproject
```

会创建目录结构 + `.status.json` 占位 + `charter.md` 占位。然后用 `/intake myproject` 接入需求。
