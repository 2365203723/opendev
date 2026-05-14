# /intake — 客户需求接入

接收客户名参数: `$ARGUMENTS`

## 模型

本命令直接在当前会话执行（不 spawn 子代理），因为 intake 需要和用户交互问问题。

如果当前父模型是 Opus，可以切 sonnet 执行（材料 > 30 页或多语言混杂时保持 Opus）。

## 执行步骤

### 1. 准备

- 客户名 = `$ARGUMENTS`（取第一个词）
- 项目目录 = `E:\projects\<客户名>`
- 原始材料目录 = `E:\intake\<客户名>\raw\`
- 创建项目目录结构: `E:\projects\<客户名>\doc\`, `doc\handoff\`, `src\`
- 读取需求来源:
  - `E:\intake\<客户名>\raw\*.txt` — 客户对话记录
  - `E:\intake\<客户名>\raw\` 下其他文件（.md, .docx 等）
  - 如果用户直接在会话里贴了需求文本，写入 `E:\intake\<客户名>\raw\chat.txt`

### 2. 读 Agent 定义

读取 `H:\claude-assets\companies\web-outsource\agents\intake-analyst\heartbeat.md`，按其中的 5 阶段漏斗执行。

### 3. 执行 Intake 5 阶段

1. **理解** — 读 raw 材料，抽事实到 `doc\raw\facts.md`
2. **分类+识别缺口** — 写 `doc\raw\gaps.md`，列必须补齐的信息
3. **问选择题** — 向用户提问（用 AskUserQuestion 或直接问），补齐缺口
4. **出草稿** — 写 `doc\requirements.md`（结构化需求文档，含布尔验收标准）
5. **确认投递** — 展示给用户确认，确认后标记完成

### 4. 创建 .status.json

```json
{
  "project": "<客户名>",
  "phase": "planning",
  "complexity": "<判断结果>",
  "agents": { "intake": { "status": "done", "lastRun": "<now>" }, ... },
  "gates": { "gate1": "pending", ... },
  "createdAt": "<now>",
  "updatedAt": "<now>"
}
```

### 5. 完成输出

告诉用户:
- 需求文档位置
- 判断的复杂度等级
- 建议下一步: "输入 `/go $ARGUMENTS` 启动开发流水线"

## 关键原则

- 验收标准必须是布尔可判定的（是/否，不是"好不好"）
- 有歧义就问，不要猜
- 读经验库: `grep -i "<相关关键词>" H:\claude-assets\lessons\INDEX.md`
