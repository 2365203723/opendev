# 02 · 搭建蓝图

> 从零在新机器上重建这套系统。按顺序执行，每步都有验证标准。全程约 2 小时（不含下载时间）。

---

## 前置条件

- Windows 10/11（本指南以 Windows 11 为准）
- Node.js ≥ 20 LTS
- Claude Code CLI 已登录
- 磁盘 ≥ 2 块，最好 7 块（C 系统盘 + 6 块 ≥ 100GB 的数据盘）
- 一次管理员权限（用于建软链接）

**验证前置**：
```bash
node --version          # v20.x 或更高
npm --version           # 10.x 或更高
claude --version        # 已安装 Claude Code
```

---

## Step 1：物理分区规划

**目标**：规划 7 个分区的职责。

即使当前只有 2-3 块盘，也先把"角色映射"定下来。未来加盘按角色补位即可。

**推荐分配（以本项目实际为准）**：

| 盘符 | 角色 | 建议大小 | 备份策略 |
|------|------|----------|----------|
| C | 总部（系统 + Claude 配置） | ≥ 200GB | 日增量 |
| D | 下载区 | 按需 | 不备 |
| E | 研发中心（热） | ≥ 300GB | 日增量 |
| F | 设计素材库 | ≥ 200GB | 周全量 |
| G | 质量部 | ≥ 100GB | 月全量 |
| H | 知识中心 ⭐ | ≥ 300GB | **日增量 + 周全量，最重要** |
| I | 档案室 | ≥ 500GB | 月全量 |
| J | 沙盒 | 随意 | 不备 |

**最少可工作配置**：只有 C + H 两块盘时，把 E/G/I 的目录也建在 H 盘。失去分区隔离但功能完整。

**验证**：
```bash
powershell -Command "Get-PSDrive -PSProvider FileSystem"
```
看到至少 C 和 H（或你选定的知识盘）即可继续。

---

## Step 2：建 H 盘资产仓库

**目标**：在 H 盘（或你选的知识盘）建中央资产目录。

```bash
mkdir -p /h/claude-assets/{agents/claude,skills,plugins,companies,skeletons,snippets,lessons,mcp-servers,docs}
```

建立的目录用途：

| 目录 | 用途 |
|------|------|
| `agents/claude/` | Claude Code 原生 subagent 定义 |
| `skills/` | Claude Code Skills |
| `plugins/` | 插件市场下载的插件 |
| `companies/` | 虚拟公司编制（核心）|
| `skeletons/` | 项目骨架模板 |
| `snippets/` | 代码片段 |
| `lessons/` | 跨项目经验库 |
| `mcp-servers/` | 自建 MCP server |
| `docs/` | 架构文档（就是本文档）|

**强烈建议 Git 化**：
```bash
cd /h/claude-assets && git init
cat > .gitignore << 'EOF'
*.log
*.tmp
.DS_Store
node_modules/
EOF
git add . && git commit -m "init asset repo"
```

**验证**：
```bash
ls /h/claude-assets/
# 应见: agents companies docs lessons mcp-servers plugins skeletons skills snippets
```

---

## Step 3：C 盘软链接到 H 盘

**目标**：让 Claude Code 读到 H 盘的资产。

⚠️ **需管理员权限一次**。右键打开 PowerShell/cmd → "以管理员身份运行"。

```cmd
REM 在管理员 CMD 中执行
cd C:\Users\%USERNAME%\.claude

REM 如果 agents / skills / plugins 已存在且有内容，先移到 H 盘
move agents H:\claude-assets\agents\claude-old 2>nul

REM 建立软链接
mklink /D "C:\Users\%USERNAME%\.claude\agents" "H:\claude-assets\agents\claude"
mklink /D "C:\Users\%USERNAME%\.claude\skills" "H:\claude-assets\skills"
mklink /D "C:\Users\%USERNAME%\.claude\plugins" "H:\claude-assets\plugins"
```

**验证**：
```bash
ls -la /c/Users/$USER/.claude/agents /c/Users/$USER/.claude/skills /c/Users/$USER/.claude/plugins
# 应显示为 符号链接（Windows 显示 <JUNCTION> 或 <SYMLINKD>）
```

---

## Step 4：~/.claude 核心配置

**目标**：建立 Claude Code 全局配置。

### 4.1 settings.json

位置：`C:\Users\{USER}\.claude\settings.json`

最小有用配置：

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings",
  "theme": "dark",
  "env": {
    "CLAUDE_CODE_AUTO_CONNECT_IDE": "false"
  },
  "permissions": {
    "allow": [
      "Bash(ls:*)",
      "Bash(cat:*)",
      "Bash(curl:*)",
      "Bash(git status)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(npm install:*)",
      "Bash(npm run:*)",
      "Bash(node:*)"
    ],
    "deny": [
      "Bash(rm -rf /*)"
    ]
  },
  "alwaysThinkingEnabled": true
}
```

### 4.2 CLAUDE.md（行为准则）

位置：`C:\Users\{USER}\.claude\CLAUDE.md`

见本仓库已有的同名文件（参考你当前的版本）。核心四节：
1. Think Before Coding（多问少猜）
2. Simplicity First（最小代码）
3. Surgical Changes（只改该改的）
4. Goal-Driven Execution（布尔验收）

### 4.3 规则分层

位置：`C:\Users\{USER}\.claude\rules\common\*.md`

建议拆分：
- `agents.md` — agent 编排策略
- `code-review.md` — 审查标准
- `coding-style.md` — 编码规范
- `git-workflow.md` — Git 约定
- `security.md` — 安全基线
- `testing.md` — 测试要求

---

## Step 5：启动 Paperclip 工单平台

**目标**：让工单 API 和 Postgres 跑起来。

### 5.1 全局装 Paperclip

```bash
npm install -g paperclipai
```

### 5.2 建数据目录

```bash
mkdir -p /h/paperclip/data /h/logs/paperclip
```

### 5.3 启动（首次）

```bash
cd /h/paperclip
nohup npx paperclipai@latest run -d H:/paperclip/data >> /h/logs/paperclip/startup.log 2>&1 &
disown
```

首次启动会：
- 下载并初始化 embedded Postgres
- 监听 `127.0.0.1:54329`（DB）和 `127.0.0.1:3100`（API）
- 建立内置 schema

**验证（等 10 秒后）**：
```bash
curl -s http://127.0.0.1:3100/api/health
netstat -ano | grep -E ":3100|:54329"
```

---

## Step 6：虚拟公司 + 5 Agent 编制

**目标**：在 Paperclip 里注册一家"web-outsource"公司，编入 5 个 agent。

### 6.1 通过 Paperclip UI 建公司

浏览器打开 `http://127.0.0.1:3100` → Create Company → 名称 `web-outsource`。

记下创建后的 `companyId`（UUID），后续所有 API 调用都用它。

### 6.2 在 H 盘建 agent 目录骨架

```bash
COMPANY_DIR=/h/claude-assets/companies/web-outsource/agents
mkdir -p $COMPANY_DIR/{ceo-orchestrator,pm-planner,architect,frontend-dev,reviewer}

# 每个 agent 建四件套
for role in ceo-orchestrator pm-planner architect frontend-dev reviewer; do
  touch $COMPANY_DIR/$role/{soul,heartbeat,tools,agents}.md
done
```

### 6.3 写 5 个 agent 的四件套

四件套完整模板见 [04-reference.md § Agent 四件套](./04-reference.md#agent-四件套)。

**快速起步**：先给每个 agent 写一份最小可用的 `soul.md`（50 字以内），运行一次 MVP 再逐步完善。

以 CEO 为例：

```markdown
<!-- ceo-orchestrator/soul.md -->
# Soul · CEO-Orchestrator

我是公司的总经理。我接客户需求，翻译成可验证的布尔章程，召集团队，最终审批交付。

## 核心价值观

1. **布尔验收 > 主观判断**：我写的章程每一条都是 YES/NO 可判的，不含"大概"
2. **少问客户想要什么，多问验收标准是什么**
3. **不越界**：不代替 architect 选技术，不代替 PM 排工单
```

### 6.4 在 Paperclip UI 注册 5 agent

进入公司详情页 → Add Agent → 分别建 5 个：
- `ceo-orchestrator`
- `pm-planner`
- `architect`
- `frontend-dev`
- `reviewer`

建完记下每个 agent 的 UUID（稍后用）。

### 6.5 查看 agent 列表

```bash
CO_ID="<你的公司 UUID>"
curl -s "http://127.0.0.1:3100/api/companies/$CO_ID/agents" \
  | python -c "import sys,json; d=json.load(sys.stdin); [print(a['name'], a['id']) for a in d]"
```

---

## Step 7：MCP 生态接入

**目标**：让 Claude Code 能调用浏览器、抓网页、查文档、问其他模型。

### 7.1 推荐接入清单

| MCP | 用途 | 安装方式 |
|-----|------|---------|
| `context7` | 拉第三方库文档 | 官方 MCP 市场 |
| `fetch` | HTTP 抓取（替代内置 WebFetch）| `npm install -g @modelcontextprotocol/server-fetch` |
| `exa` | 网络搜索（替代内置 WebSearch）| 官方 MCP 市场 |
| `chrome-devtools` | 浏览器自动化 + DevTools | 官方 MCP 市场 |
| `playwright` | 更重的浏览器自动化 | 官方 MCP 市场 |
| `memory` | 知识图谱式记忆 | 官方 MCP 市场 |
| `multi-cli` | 跨模型协审 | `npm install -g multi-cli-mcp` |
| `paperclip-mcp` | Paperclip 的 MCP 包装（可选）| `npm install -g paperclip-mcp` |

### 7.2 .claude.json 配置

位置：`C:\Users\{USER}\.claude.json`

```json
{
  "mcpServers": {
    "context7": { "command": "npx", "args": ["-y", "@context7/mcp"] },
    "fetch": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-fetch"] },
    "exa": {
      "command": "npx",
      "args": ["-y", "@exa/mcp"],
      "env": { "EXA_API_KEY": "your-key-here" }
    },
    "chrome-devtools": { "command": "npx", "args": ["-y", "chrome-devtools-mcp"] },
    "memory": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-memory"] },
    "multi-cli": { "command": "npx", "args": ["-y", "multi-cli-mcp"] }
  }
}
```

### 7.3 重启 Claude Code

退出 Claude Code 会话，重新开一个。`/mcp` 查看接入状态。

---

## Step 8：项目目录模板化

**目标**：规定每个新项目的标准布局。

```bash
mkdir -p /e/inbox /e/projects
mkdir -p /g/qa-reports
mkdir -p /i/archive/$(date +%Y)
mkdir -p /j/sandbox
```

**标准项目布局**（`E:\projects\<项目>\`）：

```
<项目>/
├── src/                 源码
├── doc/
│   ├── charter.md       CEO 章程
│   ├── plan.md          PM 计划
│   ├── design.md        Architect 设计
│   └── acceptance.md    CEO 验收
├── logs/
│   └── {agent}-{日期}.md
└── .claude/             项目覆盖层（可选）
    ├── settings.json
    └── .mcp.json
```

配套目录：

```
E:\inbox\<客户>\requirements.md          客户原始需求
G:\qa-reports\<项目>\review-NNN.md       Reviewer 报告
I:\archive\<年>\<项目>\                  归档（交付后）
```

---

## Step 9：跑通首个 MVP 验证

**目标**：用最简单的任务验证整条流水线。

### 9.1 建个测试需求

```bash
mkdir -p /e/inbox/test-client
cat > /e/inbox/test-client/requirements.md << 'EOF'
# 测试需求

目标：输出一个 hello world HTML 页面。
验收：浏览器打开 index.html 能看到 "Hello World"。
EOF
```

### 9.2 在 Claude Code 会话里接单

打开 Claude Code，输入：

```
接一个单。需求在 E:\inbox\test-client\requirements.md。按照 web-outsource 公司的 CEO→PM→Architect→Dev→Reviewer 流水线走一遍，每个角色都按 H:\claude-assets\companies\web-outsource\agents 下的 soul/heartbeat/tools 行事。
```

Claude 应该：
1. 切 CEO → 写 `doc/charter.md` → 建 Paperclip project + goal + kickoff 工单
2. 切 PM → 拆工单
3. 切 Architect → 写 `doc/design.md`
4. 切 Dev → 写 `src/index.html`
5. 切 Reviewer → 写 `G:\qa-reports\...\review-001.md`
6. 切 CEO → 写 `doc/acceptance.md`

### 9.3 验证

- `E:\projects\hello\doc\` 应有 4 个 md
- `G:\qa-reports\hello\review-001.md` 应存在
- Paperclip UI 应能看到完整工单链 status=done
- `lessons/` 下每个角色有新笔记（如果首跑无笔记，下次跑会沉淀）

---

## Step 10：持续运营

### 备份策略

```bash
# 每日备份 H 盘资产
robocopy H:\claude-assets \\backup-nas\claude-assets /MIR /Z /R:3 /W:5

# 每周全量备份 H 盘 paperclip 数据
robocopy H:\paperclip \\backup-nas\paperclip /MIR /Z /R:3 /W:5
```

### 更新流程

```bash
# 更新 Paperclip
npm update -g paperclipai

# 更新 agent 定义（从 Git）
cd /h/claude-assets && git pull

# 更新 MCP servers
npx npm-check-updates -g --filter "*mcp*"
```

### 新机器迁移

1. 安装 Node.js + Claude Code
2. `robocopy` H 盘资产到新机 H 盘
3. 按 Step 3 重建软链
4. 按 Step 4 恢复 `~/.claude/` 配置
5. 按 Step 5 启动 Paperclip（数据目录指向迁移后的 H 盘路径）
6. 完成

---

## 排错速查

### 软链建不上

- 现象：`mklink` 报 "You do not have sufficient privilege"
- 解决：必须**以管理员身份**运行 CMD

### Paperclip 起不来

- 现象：`curl :3100` 超时
- 检查：`tail /h/logs/paperclip/startup.log`
- 常见：embedded Postgres 初始化慢（首次 ≥ 30 秒）、3100 端口被占

### Claude Code 看不到 MCP

- 现象：`/mcp` 列表里没有期望的 server
- 检查：`.claude.json` JSON 语法、MCP 命令能否独立运行
- 解决：重启 Claude Code，观察启动日志

### Agent 四件套没被读到

- 现象：切角色后行为不符
- 检查：Claude 是否实际 Read 了对应文件（查工具调用记录）
- 解决：在接单 prompt 里显式说"请 Read H:\claude-assets\companies\web-outsource\agents\<role>\soul.md"

---

## 下一步

- 跑通测试 MVP 后 → 接真实订单，参见 [03-runbook.md](./03-runbook.md)
- 想增减角色 / 新建公司 → 参见 [04-reference.md § 新增 Agent](./04-reference.md#新增-agent)
