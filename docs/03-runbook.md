# 03 · 日常使用手册

> 你已经搭好系统（见 [02-blueprint.md](./02-blueprint.md)），现在要用它接单干活。本文档覆盖完整工作流。

---

## 一、新项目从 0 到交付

### 0 · 接单前的准备（第一次使用）

确认服务在线：

```bash
# Paperclip API 活着
curl -s --max-time 3 http://127.0.0.1:3100/api/health

# 找不到时拉起来
cd /h/paperclip && nohup npx paperclipai@latest run -d H:/paperclip/data \
  >> /h/logs/paperclip/startup.log 2>&1 &
disown
sleep 5 && netstat -ano | grep :3100
```

拿到关键 ID（复制备用）：

```bash
# 找到 web-outsource 公司 ID
curl -s http://127.0.0.1:3100/api/companies | python -c "import sys,json; [print(c['name'],c['id']) for c in json.load(sys.stdin)]"

# 用公司 ID 查 5 agent ID
CO=<公司UUID>
curl -s "http://127.0.0.1:3100/api/companies/$CO/agents" \
  | python -c "import sys,json; [print(a['name'].ljust(20),a['id']) for a in json.load(sys.stdin)]"
```

记下 5 个 agentId：`ceo` / `pm` / `architect` / `dev` / `reviewer`。

---

### 1 · 客户需求入库

新开一个 Claude Code 会话（不在任何项目目录），告诉 Claude：

```
接一个新单：客户 <名字>，需求是 <一句话>。
请按 web-outsource 流水线走，每步结束在 Paperclip 建工单。
```

Claude 作为 CEO 会：
1. 用 `AskUserQuestion` 追问模糊点（范围 / 技术偏好 / 验收松紧 / 预算 / 截止）
2. 把需求书写到 `E:\inbox\<客户>\requirements.md`
3. 写章程 `E:\projects\<项目>\doc\charter.md`（10 条布尔验收）
4. 创建 Paperclip `project` + `goal`
5. 下 kickoff 工单给 PM

**关键**：**章程里的验收条目必须是布尔可判的**。下面是好坏对比：

| 差（主观） | 好（布尔）|
|-----------|-----------|
| 页面要美观 | 首页含 hero/about/posts/contact 四个 section，chrome-devtools DOM 可见 |
| 后端要稳定 | 连续 POST 100 条留言无 5xx |
| 加载快 | 首页 Load 事件 ≤ 1.5s，chrome-devtools 可测 |

---

### 2 · PM 拆工单

CEO 关 kickoff 工单后，切 PM。PM 读 charter + `lessons/pm.md`，产出：

- `doc/plan.md`：含 mermaid 依赖图、每个工单的预算时间、验收标准
- 通过 API 批量创建 N 个工单，分配 assignee

**工单命名规范**：

```
[发起者->接收者] 任务主题 (关键约束)

例：
[PM->Architect] 技术评估+设计 design.md (含博主后台二选一)
[PM->Dev] 留言+限流 (每IP每分钟<=5, XSS 转义)
```

---

### 3 · Architect 设计

切 Architect。输出 `doc/design.md`，至少包含：

```markdown
# 一、技术栈选型（表格，每一项含选型理由）
# 二、关键决策（授权范围内的"二选一"）
# 三、数据模型（SQL DDL 直接可用）
# 四、REST API 契约（Method / Path / Body / 响应 / 备注）
# 五、项目结构（目录树）
# 六、Seed 数据（可被 dev 直接照抄）
# 七、给 Dev 的实现顺序建议（对应工单）
# 八、偏离处置（哪些改动需要回问 architect）
```

**Architect 权力边界（重要）**：
- ✅ 可拍板"二选一"技术决策（在章程授权范围内）
- ✅ 可拒绝 dev 提出的"多装一个依赖"
- ❌ 不能改章程的验收条目
- ❌ 不能跳过 reviewer 直接宣告 PASS

---

### 4 · Dev 实施

切 Dev。按 design.md § 七的顺序实施：

1. 骨架（server 能起 + 前端静态页能看）
2. 功能模块（按工单拆分做）
3. 自检（curl 跑一遍 10 条章程）
4. README（启动步骤 + 维护说明 + 已知问题）

**标准启动方式（Node 项目）**：

```bash
cd /e/projects/<项目>/src
npm install --registry=https://registry.npmmirror.com
npm run dev
# 或后台跑
nohup node server.js > /e/projects/<项目>/logs/server.log 2>&1 &
```

**Dev 完工必做**：
- Multi-CLI 协审：`Ask-Codex` + `Ask-Gemini` 扫一遍关键代码，留观察
- 10 条章程 self-check，结果写工单 comment
- 4 个 dev 工单（骨架 / 功能A / 功能B / 收尾）一起 status=done
- 唤醒 Reviewer 工单 status=in_progress

---

### 5 · Reviewer 审查

切 Reviewer。按 heartbeat 四维度审查：

**① 代码审查**

```bash
# 进 src 目录，人工扫关键点：
# - 是否所有 SQL 走 prepared statement
# - 是否有硬编码密钥
# - 是否有超过 50 行的函数
# - 是否有 console.log 残留
```

**② 安全审查（OWASP Top 10）**

```bash
# CSP / 安全头
curl -sI http://localhost:<端口>/ | grep -iE "^(content-security-policy|x-content-type-options|x-frame-options|strict-transport|referrer-policy)"

# XSS 验证
curl -X POST http://localhost:<端口>/api/<有用户输入的接口> \
  -H 'content-type: application/json' \
  -d '{"content":"<script>alert(1)</script>"}'
# 检查入库是否已转义

# 限流验证
for i in 1 2 3 4 5 6 7; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:<端口>/api/<限流接口> \
    -H 'content-type: application/json' -d '{"x":"y"}'
done
# 期望第 6 条返回 429
```

**③ 视觉审查**

```
# Claude 里调用 chrome-devtools MCP：
mcp__chrome-devtools__new_page     url=http://localhost:3000
mcp__chrome-devtools__evaluate_script  function=() => ({...DOM 关键字段...})
mcp__chrome-devtools__take_screenshot  filePath=%TEMP%\screenshot.png  fullPage=true
# 然后用 Bash cp 到 G:\qa-reports\<项目>\screenshots\
```

**⚠️ Chrome DevTools MCP 白名单限制**：只能写 `C:\Users\<你>\` 和 `%TEMP%`。跨盘要先写临时，再 cp。

**④ 性能审查（章程明确要求时才跑）**

```
# Lighthouse 通过 chrome-devtools MCP
mcp__chrome-devtools__lighthouse_audit  url=http://localhost:3000
```

**Reviewer 产出**：

`G:\qa-reports\<项目>\review-NNN.md`，结构：

```markdown
# 结论（PASS / FAIL / PASS_WITH_WARNINGS）
# 一、代码审查
# 二、安全审查（OWASP Top 10 表格）
# 三、视觉审查
# 四、性能审查
# 五、10 条章程验收对照表
# 六、观察项（非 blocker）
# 七、建议后续工作
# 八、审查流程声明
```

**结论规则**：
- **PASS**：10/10 章程全过 + 无观察项
- **PASS_WITH_WARNINGS**：10/10 章程全过 + 有观察项（非 blocker）
- **FAIL**：任一章程未过 → 回 Dev 重做

---

### 6 · CEO 最终验收

切 CEO。写 `doc/acceptance.md`，对照章程 10 条 → 全过则 `ACCEPT`。

关闭最后一个 WEB-N 工单 + goal + project。归档：

```bash
# 复制项目到档案室
robocopy E:\projects\<项目> I:\archive\2026\<项目> /MIR /Z

# 交付物路径告知用户
echo "项目在 E:\projects\<项目>\，启动: cd src && npm run dev"
```

---

### 7 · 经验沉淀（每个角色）

项目交付后，每个角色（或 CEO 代理）追加一条到 `H:\claude-assets\lessons\<角色>.md`：

```markdown
## N. <场景标题>

**场景**：<一句话描述>

**结论**：<核心洞察>

**下次怎么办**：<可执行动作>
```

**什么值得写**：
- 工具/API 契约的非直觉行为（如 Paperclip comment body 字段名叫 `body` 不叫 `content`）
- 权力边界问题（如 frontend-dev 能否兼做后端）
- 跨项目可复用的决策模式（如 MVP 后台默认选文件版）

**不值得写**：
- 具体代码实现（写 snippets 里）
- 项目专属事实（写项目 doc 里）

---

## 二、常用 API 速查

### 创建工单

```bash
curl -X POST http://127.0.0.1:3100/api/companies/$CO/issues \
  -H 'content-type: application/json' \
  -d '{
    "title": "[PM->Dev] 功能 X",
    "description": "详情...",
    "projectId": "<projectUUID>",
    "goalId": "<goalUUID>",
    "assigneeAgentId": "<agentUUID>",
    "reporterAgentId": "<agentUUID>",
    "status": "todo",
    "priority": "high"
  }'
```

### 改工单状态

```bash
# todo -> in_progress -> done
curl -X PATCH http://127.0.0.1:3100/api/issues/<issueUUID> \
  -H 'content-type: application/json' \
  -d '{"status":"in_progress"}'
```

### 添加工单评论

```bash
curl -X POST http://127.0.0.1:3100/api/issues/<issueUUID>/comments \
  -H 'content-type: application/json' \
  -d '{
    "authorAgentId": "<agentUUID>",
    "body": "handoff note..."
  }'
```

⚠️ **字段名坑**：是 `body` 不是 `content`。我踩过。

### 列工单

```bash
curl -s "http://127.0.0.1:3100/api/companies/$CO/issues?limit=50"
```

---

## 三、多项目并行

同时跑多个项目时：

1. **工作树隔离**：每个项目独立 `E:\projects\<项目>\`
2. **工单隔离**：每个项目独立 Paperclip project，工单 key 自动区分（WEB-10 vs OTHER-5）
3. **Reviewer 队列**：高优先项目插队（`priority: high`）
4. **上下文切换**：在 Claude Code 里用不同的 session 分别跑，避免混淆

---

## 四、回环处理（FAIL 情形）

Reviewer FAIL 时：

```bash
# 改工单回 in_progress + reassign 给 dev
curl -X PATCH http://127.0.0.1:3100/api/issues/<devIssueUUID> \
  -d '{"status":"in_progress","assigneeAgentId":"<devUUID>"}'

# 留交接 comment
curl -X POST http://127.0.0.1:3100/api/issues/<devIssueUUID>/comments \
  -d '{"authorAgentId":"<reviewerUUID>","body":"FAIL 原因：条目 5 验收未过（具体描述）+ 修复建议"}'
```

**回环上限**：连续 3 轮 Dev-Reviewer FAIL → 自动升级给 Architect（重审设计）或 CEO（重审章程）。

---

## 五、两种执行模式切换

### 记账簿模式（默认）

你开一个 Claude Code 会话，明确指示它按 `web-outsource` 公司流程扮演各个角色。Claude 依次：
- 读 soul/heartbeat
- 执行角色动作
- 通过 HTTP API 更新 Paperclip
- 主动切下一个角色

**优势**：可观测、可中断、token 可控
**劣势**：需要用户"守着"

### 调度器模式（进阶，未默认启用）

Paperclip 心跳定时器唤醒 agent，agent 自动跑自己的 heartbeat 决策树。人不在电脑前也能跑。

**启用方式**：当前版本的 `paperclipai run` 默认起 API server 但不起心跳调度器。需要单独运行 runner（具体见 Paperclip 文档 / CLI help）。

**在两种模式之间切换无成本**：同一套 agent 四件套、同一个工单数据。

---

## 六、日常维护

### 每日

- 看 Paperclip UI 的 Board 视图，确认昨日所有工单 status=done
- `tail /h/logs/paperclip/startup.log` 看有无异常

### 每周

- `cd /h/claude-assets && git status`，把新写的 lessons 提交
- 检查 `I:\archive\` 空间余量

### 每月

- 回顾 `lessons/` 每个角色，合并重复条目
- 检查 MCP server 版本：`npx npm-check-updates -g --filter "*mcp*"`

---

## 七、常见协作场景

### 场景 A：客户追加需求（项目已在 Dev 阶段）

1. CEO 审核追加需求 vs 当前章程
2. 如果在原章程范围内 → 直接作为新工单给 Dev
3. 如果超范围 → **新起 charter v2**（不改 v1），重新走 PM → Architect
4. 告知客户：会影响工期

### 场景 B：Dev 卡住超预算 2x

1. Dev 在工单 comment 里说明卡点
2. PM 收到后决策：
   - 技术卡点 → `@architect` 介入
   - 需求模糊卡点 → 升级 CEO 追客户
3. 卡 ≥ 4 小时 → 默认升级 CEO

### 场景 C：发现章程条目本身写错了

1. CEO 发起章程修订，写 `doc/charter-v2.md`（不改 v1）
2. v2 里明确列出 v1 哪些条目作废
3. 相关 agent 重新读 v2 继续工作
4. Reviewer 以 v2 为准

---

## 八、什么时候不走完整流水线

**5 角色全上**的场景：
- 新客户订单
- 预算 > $10
- 工期 > 半天

**简化流水线**（Dev 直接上）的场景：
- bug fix 且影响面明确
- 文档补写
- 小样例 / 技术验证
- 用户自己要求"不要走 CEO"

简化时在 Paperclip 里建个独立项目标记 `shortcut`，免得混入主流 lessons。

---

## 下一步

- 想新增角色（backend-dev / devops）→ [04-reference.md § 新增 Agent](./04-reference.md#新增-agent)
- 想摸清 Paperclip 所有 API → [04-reference.md § Paperclip API](./04-reference.md#paperclip-rest-api)
- 想改 agent 的 soul/heartbeat → [04-reference.md § Agent 四件套](./04-reference.md#agent-四件套)
