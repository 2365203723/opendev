# 04 · 参考手册

> 字段级细节、API 契约、扩展指南。你不需要全读，但需要它时能快速查到。

---

## 目录结构全景

```
C:\Users\<USER>\
├── .claude\                       [L1 配置层]
│   ├── agents/        → H:\claude-assets\agents\claude\     [软链]
│   ├── skills/        → H:\claude-assets\skills\            [软链]
│   ├── plugins/       → H:\claude-assets\plugins\           [软链]
│   ├── settings.json                  全局 hooks / 权限 / env
│   ├── CLAUDE.md                      行为准则（全局）
│   ├── rules/common/*.md              规则分层（全局）
│   ├── memory/
│   │   ├── MEMORY.md                  记忆索引（自动加载）
│   │   └── <type>_<topic>.md          具体记忆
│   └── projects/.../memory/           会话级记忆
└── .claude.json                   MCP 服务器声明

H:\claude-assets\                  [L2 资产仓库层]
├── agents\
│   └── claude\                    Claude Code subagent 定义
├── skills\                        Claude Code Skills
├── plugins\                       插件市场
├── companies\                     [L3 Agent 定义层]
│   └── web-outsource\
│       └── agents\
│           ├── ceo-orchestrator\
│           ├── pm-planner\
│           ├── architect\
│           ├── frontend-dev\
│           └── reviewer\
│               ├── soul.md
│               ├── heartbeat.md
│               ├── tools.md
│               └── agents.md
├── skeletons\                     项目骨架
├── snippets\                      代码片段
├── lessons\                       跨项目经验库
├── mcp-servers\                   自建 MCP server
└── docs\                          本架构文档

H:\paperclip\                      [L4 编排层]
├── data\                          Paperclip 数据目录
│   ├── pg\                        embedded Postgres 数据
│   └── instances\
│       └── default\
│           ├── config.json
│           ├── companies\
│           ├── projects\
│           └── workspaces\
└── logs\                          Paperclip 日志

H:\logs\                           运行时日志
├── paperclip\                     Paperclip 启动 + 运行日志
└── agents\                        Agent 运行日志（心跳模式用）

E:\inbox\<客户>\                   [L0 物理层 - 客户入口]
└── requirements.md

E:\projects\<项目>\                [L0 物理层 - 研发中心]
├── src\
├── doc\
│   ├── charter.md
│   ├── plan.md
│   ├── design.md
│   └── acceptance.md
├── logs\
└── .claude\                       项目层配置（可选）

G:\qa-reports\<项目>\              [L0 物理层 - 质量部]
├── review-NNN.md
└── screenshots\

I:\archive\<年>\<项目>\            [L0 物理层 - 档案室]

J:\sandbox\                        [L0 物理层 - 沙盒]
```

---

## Agent 四件套

每个 agent 目录下 **必须有** 4 个文件。文件名大小写敏感。

### soul.md

**回答**：我是谁？

**结构建议**：

```markdown
# Soul · <Agent Name>

## 一句话身份

<用一句话说清这个 agent 的核心存在理由>

## 核心价值观（3-5 条）

1. <价值观 1>
2. <价值观 2>
...

## 反模式（我绝不做的事）

- <反模式 1，如"不越界代替 architect 选技术栈"> 
- <反模式 2>

## 对协作者的承诺

- 对上游：<我承诺...>
- 对下游：<我承诺...>
```

**写作原则**：soul 极少改（季度级）。如果 soul 每周都改，说明身份定义出问题了。

---

### heartbeat.md

**回答**：被心跳唤醒时我先做什么？

**结构建议**：

```markdown
# Heartbeat · <Agent Name>

## 触发条件

我被唤醒的场景：
1. 被分配新工单
2. 收到上游交接 comment
3. 心跳定时扫 inbox 发现待办

## 决策树

### Case A: 新工单 status=todo
步骤：
1. 读 soul.md 确认行为边界
2. 读 lessons/<我>.md 看历史经验
3. 读 agents.md 查协作者
4. 读工单 description + 关联文档
5. 动手（产出物清单）
6. 工单 status→in_progress，留进度 comment
7. 完成时 status→done，交接给下游（留 comment 或建新工单）

### Case B: 被回环（reviewer FAIL）
步骤：
1. 读 reviewer 的 FAIL 报告
2. 定位失败条目
3. 改代码 / 改设计 / 回问 CEO（根据失败级别）

### Case C: 超时 / 卡住
步骤：
1. 工单 comment 写明卡点
2. 根据卡点类型升级（architect / PM / CEO）
```

**写作原则**：heartbeat 每次项目结束都值得回顾是否要微调。

---

### tools.md

**回答**：我被允许做什么？

**结构**：

```markdown
# Tools · <Agent Name>

## 允许的工具

- Read / Glob / Grep：自由读
- Bash：仅以下命令白名单
  - `git status / diff / log`
  - `npm install`
  - ...
- Edit / Write：仅能写以下路径
  - `E:\projects\<当前项目>\**`
  - `G:\qa-reports\<当前项目>\**`（仅 reviewer）
- HTTP API (via curl)：Paperclip `:3100` 全部端点
- MCP：
  - chrome-devtools（仅 reviewer）
  - multi-cli（仅 dev）

## 禁止的工具

- 主动 git push（需 CEO 批准）
- 删除 node_modules 以外的任何文件
- 改 `~/.claude/` 下的任何文件
```

**写作原则**：白名单优先于黑名单。心疼 token 也要写清，能防止一次失误。

---

### agents.md

**回答**：我可以呼叫谁、如何协作？

**结构**：

```markdown
# Agents · <Agent Name>

## 我的上游

- **<上游 Agent>**：什么情况下会给我派单
  - 交接物：<文件路径或 comment 格式>
  - 期望我回什么：<文件 / 新工单 / comment>

## 我的下游

- **<下游 Agent>**：我什么时候会给他派单
  - 我交接什么给他
  - 他回我什么

## 我的平级

- **<平级 Agent>**：什么情况下 ping 他
```

**写作原则**：画出来就像组织架构图。交接物明确到文件路径，不给下游"自己猜"的空间。

---

## Paperclip REST API

### 基础

- Base URL: `http://127.0.0.1:3100`
- 格式：JSON
- 认证：本地服务暂无认证

### 核心端点

#### Companies

```
GET    /api/companies                          列所有公司
POST   /api/companies                          建公司
GET    /api/companies/:companyId               公司详情
PATCH  /api/companies/:companyId               改公司
```

#### Agents

```
GET    /api/companies/:companyId/agents        列公司所有 agent
POST   /api/companies/:companyId/agents        建 agent
GET    /api/agents/:agentId                    agent 详情
PATCH  /api/agents/:agentId                    改 agent
```

#### Projects

```
GET    /api/companies/:companyId/projects      列项目
POST   /api/companies/:companyId/projects      建项目
  body: { name, description, status }
  status 枚举: "in_progress" | "done" | "archived"（取决于版本）
PATCH  /api/projects/:projectId                改项目
```

#### Goals

```
POST   /api/companies/:companyId/goals         建目标
  body: { title, description, projectId, status }
  status 常用: "active" | "done"
```

#### Issues

```
GET    /api/companies/:companyId/issues?limit=N    列工单
POST   /api/companies/:companyId/issues            建工单
  body: {
    title, description,
    projectId, goalId,
    assigneeAgentId, reporterAgentId,
    status: "todo" | "in_progress" | "done",
    priority: "high" | "medium" | "low"
  }
PATCH  /api/issues/:issueId                    改工单（状态/指派/优先级）
GET    /api/issues/:issueId                    工单详情
```

#### Comments（工单评论）

```
POST   /api/issues/:issueId/comments
  body: {
    authorAgentId,   必填
    body             必填，字段名就叫 body（不是 content！）
  }
```

---

### 字段名坑（踩过的）

| 操作 | 期望字段 | 实际字段 |
|------|---------|---------|
| Comment 正文 | content | **body** |
| Project status | active | **in_progress** 或 **done** |
| Issue priority | p0/p1/p2 | **high/medium/low** |

遇到 `Validation error` 时看返回的 `details.path` 定位哪个字段出错。

---

## MCP 清单

### 推荐安装

| MCP | 命令 | 用途 | 必需性 |
|-----|------|------|--------|
| fetch | `npx @modelcontextprotocol/server-fetch` | HTTP 抓取 | ⭐ 必需 |
| context7 | `npx @context7/mcp` | 第三方库文档 | ⭐ 必需 |
| exa | `npx @exa/mcp` | 网络搜索 | 推荐 |
| chrome-devtools | `npx chrome-devtools-mcp` | 浏览器自动化 | ⭐ Reviewer 必需 |
| playwright | `npx @playwright/mcp` | 复杂 UI 测试 | 可选 |
| memory | `npx @modelcontextprotocol/server-memory` | 知识图谱记忆 | 可选 |
| multi-cli | `npx multi-cli-mcp` | 多模型协审 | ⭐ Dev 必需 |
| paperclip-mcp | `npx paperclip-mcp` | Paperclip 包装 | 可选（可用 curl 替代） |

### .claude.json 示例

```json
{
  "mcpServers": {
    "fetch": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch"]
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@context7/mcp"]
    },
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp"],
      "env": {
        "CHROME_DEVTOOLS_WORKSPACE_ROOTS": "C:\\Users\\23652;C:\\Users\\23652\\AppData\\Local\\Temp"
      }
    },
    "multi-cli": {
      "command": "npx",
      "args": ["-y", "multi-cli-mcp"]
    }
  }
}
```

### Chrome DevTools MCP 白名单

**已知限制**：只能写入配置里的 workspace roots。想让它直接写 G 盘：

```json
"env": {
  "CHROME_DEVTOOLS_WORKSPACE_ROOTS": "C:\\Users\\23652;G:\\qa-reports"
}
```

（具体环境变量名以最新 MCP 文档为准。）

---

## 新增 Agent

### 场景：给 `web-outsource` 公司加一个 `backend-dev`

#### 1. 建目录 + 四件套

```bash
ROOT=/h/claude-assets/companies/web-outsource/agents/backend-dev
mkdir -p $ROOT

# 四件套
cat > $ROOT/soul.md << 'EOF'
# Soul · Backend-Dev

## 身份
后端开发工程师。负责 Node/Python/Go 等后端代码。

## 价值观
1. 数据边界是神圣的：所有入参校验、所有 SQL 参数化
2. 幂等性优先：设计接口时先想失败重试会发生什么
3. 不侵入 frontend-dev 的前端代码

## 反模式
- 不写"以后可能需要"的通用中间件
- 不越权做 DevOps 的部署
EOF

cat > $ROOT/heartbeat.md << 'EOF'
# Heartbeat · Backend-Dev
（决策树，参考 frontend-dev/heartbeat.md 的结构）
EOF

cat > $ROOT/tools.md << 'EOF'
# Tools · Backend-Dev

允许：Read/Grep/Bash(npm/node/python/go)/Edit/Write 仅限项目目录
允许 MCP：multi-cli, context7, fetch
禁止：Edit 前端代码（public/ 目录）
EOF

cat > $ROOT/agents.md << 'EOF'
# Agents · Backend-Dev

上游：architect（design.md → 后端契约）
下游：reviewer
平级：frontend-dev（API 契约对齐）
EOF
```

#### 2. 在 Paperclip 注册

```bash
CO=<公司UUID>
curl -X POST "http://127.0.0.1:3100/api/companies/$CO/agents" \
  -H 'content-type: application/json' \
  -d '{
    "name": "backend-dev",
    "description": "后端开发工程师",
    "urlKey": "backend-dev"
  }'
```

#### 3. 更新 PM 的 agents.md

让 PM 知道现在有 backend-dev 可以派单：

编辑 `companies/web-outsource/agents/pm-planner/agents.md`，下游清单加一行 `backend-dev`。

#### 4. 更新 architect 的 design.md 模板

Design 里的"项目结构"需要区分前后端目录，避免两 dev 撞车。

---

## 新增虚拟公司

### 场景：再开一家 `data-team` 做数据项目

#### 1. 在 Paperclip UI 建公司

记下新公司 UUID。

#### 2. 建目录结构

```bash
mkdir -p /h/claude-assets/companies/data-team/agents/{ceo,pm,data-architect,etl-dev,data-reviewer}
```

为每个 agent 写四件套。

#### 3. 写一份 `data-team-charter.md`

位置：`/h/claude-assets/companies/data-team/charter.md`

说明这家公司：
- 做什么类型的项目（数据抓取 / 清洗 / 可视化）
- 和 `web-outsource` 的边界（不抢单）
- 默认工具栈（Python / pandas / Airflow）

---

## 新增 Skill

Skills 不同于 Agent。Skill 是一段可复用的"能力脚本"，不是一个"角色"。

位置：`H:\claude-assets\skills\<skill-name>\`

典型结构：

```
<skill-name>/
├── skill.md                 说明这个 skill 做什么、什么时候触发
├── scripts/*.sh             可执行脚本
└── references/*.md          背景资料
```

Claude Code 会自动扫 `~/.claude/skills/`（软链指向 H 盘），把每个 skill 列入可用清单。

---

## Hooks 配置

位置：`~/.claude/settings.json` 的 `hooks` 字段。

### 常用 hook 类型

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{"type": "command", "command": "..."}]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{"type": "command", "command": "prettier --write $FILE"}]
      }
    ],
    "Stop": [
      {"hooks": [{"type": "command", "command": "..."}]}
    ]
  }
}
```

### 推荐 hooks

| Hook | 用途 |
|------|------|
| `PreToolUse` on Bash | 阻断 `rm -rf /` 之类危险命令 |
| `PostToolUse` on Edit/Write | 自动跑 formatter |
| `Stop` | 交付前跑 security-reviewer |

---

## 权限与安全

### 核心原则

1. **最小权限**：每个 agent 的 tools.md 列白名单
2. **写入边界**：Reviewer 只能写 `G:\qa-reports\`
3. **不能删的东西**：`~/.claude/`、`H:\claude-assets\` 的 agent 定义

### 敏感文件处理

- `.env`、`credentials.json`、`*.key` 一律不纳入任何 agent 可读白名单
- 客户 PII 必须在 `doc/charter.md` 里用"占位"表示
- Paperclip DB 里的 agent 对话历史不应外传

---

## 已知限制

### L1 配置层

| 限制 | 影响 | 解决 |
|------|------|------|
| Claude Code 入口路径写死在 `~/.claude` | 不能整体挪盘 | 用 mklink 软链到 H 盘 |
| `.claude.json` 的 MCP 改动需重启 | 不能热加载 | 改完退出 Claude 重进 |

### L3 Agent 层

| 限制 | 影响 | 解决 |
|------|------|------|
| 四件套无 schema 校验 | 拼写错误只在运行时发现 | 写 agent 时参考已有模板 |
| Claude 不会自动"切角色" | 每次要 prompt 里明说 | 在工单 description 引导 |

### L4 编排层

| 限制 | 影响 | 解决 |
|------|------|------|
| Paperclip 心跳调度未默认启用 | MVP 阶段靠手动扮演 | 下一阶段摸索 runner 启动 |
| `PATCH /api/goals/:id` schema 不同于 issues | 批量关闭时遇坑 | 用 UI 手动关，或先摸 API |
| embedded Postgres 初始化慢 | 首次启动 > 30s | 等够，不要反复杀进程 |

### L2 资产层

| 限制 | 影响 | 解决 |
|------|------|------|
| `chrome-devtools` MCP workspace roots 默认只到 C 盘 | 截图跨盘需中转 | 配置 env 扩展（参见上文） |
| lessons/ 无自动抽取机制 | 靠人工追加 | 未来加 Stop hook 自动化 |

---

## 数据备份策略

### 关键路径备份优先级

| 优先级 | 路径 | 频率 | 原因 |
|--------|------|------|------|
| ⭐⭐⭐ | `H:\claude-assets\` | 日增量 | 全部可复用资产 |
| ⭐⭐⭐ | `H:\paperclip\data\` | 日增量 | 工单历史 |
| ⭐⭐ | `E:\projects\` | 日增量 | 在做项目 |
| ⭐⭐ | `G:\qa-reports\` | 周全量 | 质检凭证 |
| ⭐ | `C:\Users\<U>\.claude\` | 周全量 | 记忆 + 配置 |
| ⭐ | `I:\archive\` | 月全量 | 已交付冷数据 |

### robocopy 模板

```bash
# 日增量备份
robocopy H:\claude-assets \\nas\claude-assets /MIR /Z /R:3 /W:5 /LOG:H:\logs\backup-daily.log

# 周全量
robocopy H:\paperclip \\nas\paperclip-backup-2026-W19 /E /Z
```

---

## Version History

- **v1.0** (2026-05-09)：首版，配套 Personal Blog MVP 跑通

## 贡献指南

修改本文档前：
- 改 `01-overview.md`：需要 CEO（你）审批
- 改 `02-blueprint.md`：新增步骤需先在一台新机器上验证过
- 改 `03-runbook.md`：每次项目交付后回顾一次，补充实战发现
- 改 `04-reference.md`：只改事实性字段、API 契约、版本号

每次修改在文件顶部加一行 `> Last updated: YYYY-MM-DD by <role>`。
