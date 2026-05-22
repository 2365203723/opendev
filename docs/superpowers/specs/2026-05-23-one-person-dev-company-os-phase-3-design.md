# 一人开发公司 OS Phase 3 设计规格：记忆系统

> 日期：2026-05-23
> 状态：已确认设计规格
> 前置：Phase 2 已合并到 master（`37b8d89`）
> 范围：Raw Events → Episodes → Facts → Retrieval Pack，LLM 辅助压缩，后台预生成

## 1. 背景与目标

Phase 2 实现了迭代闭环，但每次 Runner 启动时 Agent 没有任何历史上下文，无法利用过去的决策、约束和经验。Phase 3 建立分层记忆系统，让 Agent 在启动前获得精准的上下文包（Retrieval Pack），同时保证记忆可追溯、可过期、可替代。

### 1.1 目标

1. 记录系统内所有关键事件为 Raw Events。
2. 用 LLM 将 Raw Events 压缩为 Episodes（阶段摘要）。
3. 用 LLM 从 Episodes 中提取 Facts（可复用事实）。
4. 每次有新 Raw Event 时后台异步触发 Episode/Fact 重新生成。
5. Runner 启动前读取最新 Retrieval Pack，将其注入 headless prompt。
6. Web Console 新增记忆中心页面，展示 Events/Episodes/Facts 和 Pack 状态。

### 1.2 非目标

1. 不实现 Memory Tree 的完整层级 UI（Phase 4 随四层工作流一起做）。
2. 不实现跨公司/跨客户的记忆隔离（当前只有单公司场景）。
3. 不实现记忆的向量检索（文本匹配足够，Phase 5+ 再考虑）。
4. 不修改 Phase 0+2 现有八张表和现有 API 语义。
5. 不实现 Facts 的人工编辑（只读展示）。

## 2. 数据模型扩展

Phase 3 在现有 SQLite schema 上新增四张表，不修改 Phase 0+2 的八张表。

### 2.1 新增 SQLite 表

```sql
CREATE TABLE IF NOT EXISTS raw_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  source TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  event_ids TEXT NOT NULL,
  artifact_paths TEXT NOT NULL,
  conclusion TEXT NOT NULL,
  generated_by_run_id TEXT,
  valid_from TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  fact_type TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  content TEXT NOT NULL,
  source_event_ids TEXT NOT NULL,
  source_paths TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  valid_from TEXT NOT NULL,
  expires_at TEXT,
  supersedes_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  generated_by_run_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supersedes_id) REFERENCES facts(id)
);

CREATE TABLE IF NOT EXISTS retrieval_packs (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  run_id TEXT,
  content TEXT NOT NULL,
  episode_ids TEXT NOT NULL,
  fact_ids TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 2.2 字段说明

**raw_events**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | UUID |
| event_type | TEXT | user_message / command_run / agent_run / file_changed / gate_result / review_result / decision |
| scope_type | TEXT | company / project / cr |
| scope_id | TEXT | 对应实体的 name 或 id |
| payload | TEXT | JSON 字符串，事件详情 |
| source | TEXT | control_plane / user / watcher |
| occurred_at | TEXT | 事件实际发生时间（ISO 8601） |

**episodes**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | UUID |
| scope_type / scope_id | TEXT | 同 raw_events |
| title | TEXT | 一句话标题 |
| summary | TEXT | 2-5 句摘要 |
| event_ids | TEXT | JSON 数组，关联的 raw_event id 列表 |
| artifact_paths | TEXT | JSON 数组，关联产物路径 |
| conclusion | TEXT | 结论或决策 |
| generated_by_run_id | TEXT | 生成本 Episode 的 LLM run id |
| valid_from | TEXT | Episode 覆盖的起始时间 |

**facts**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | UUID |
| fact_type | TEXT | user_preference / project_constraint / architecture_decision / delivery_fact / risk_fact / lesson_fact |
| scope_type / scope_id | TEXT | 同 raw_events |
| content | TEXT | 事实内容，自然语言 |
| source_event_ids | TEXT | JSON 数组 |
| source_paths | TEXT | JSON 数组，来源文件路径 |
| confidence | REAL | 0.0–1.0，LLM 输出的置信度 |
| valid_from | TEXT | 生效时间 |
| expires_at | TEXT | 过期时间，null 表示永不过期 |
| supersedes_id | TEXT | 替代的旧 Fact id |
| status | TEXT | active / expired / superseded / rejected |
| generated_by_run_id | TEXT | 生成本 Fact 的 LLM run id |

**retrieval_packs**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | UUID |
| scope_type / scope_id | TEXT | 同 raw_events |
| run_id | TEXT | 使用本 Pack 的 Runner run id，null 表示预生成未使用 |
| content | TEXT | JSON 字符串，完整 Pack 内容（见 4.2） |
| episode_ids | TEXT | JSON 数组，Pack 引用的 Episode id |
| fact_ids | TEXT | JSON 数组，Pack 引用的 Fact id |
| generated_at | TEXT | 生成时间 |
| expires_at | TEXT | 过期时间（generated_at + 30 分钟） |

## 3. Raw Events 记录

### 3.1 触发来源

**Control Plane 内部（自动）**

Control Plane 在以下时机写入 Raw Event，不需要用户操作：

| 时机 | event_type | payload 关键字段 |
|------|-----------|-----------------|
| Runner run 启动 | command_run | runId, commandType, targetName, prompt |
| Runner run 完成 | command_run | runId, status, exitCode, finishedAt |
| CR 状态变更 | agent_run | crId, fromStatus, toStatus |
| index rebuild 完成 | command_run | indexedProjects, duration |
| Gate 状态变更（索引时发现） | gate_result | projectName, gateName, status, evidencePath |

**用户手动（Web Console）**

用户可在 Web Console 记忆中心手动添加两类事件：

- `user_message`：记录用户的需求、确认或反馈。
- `decision`：记录用户或 CEO 确认的决策。

**文件系统 Watcher（自动）**

Watcher 监听 `E:/projects/**/.status.json` 变更，检测到文件修改时写入 `file_changed` 事件，payload 含文件路径和变更摘要（新旧 phase/status 对比）。

Watcher 使用 Node.js `fs.watch`，防抖 500ms，避免短时间内重复触发。

### 3.2 API

```
POST /api/memory/events          — 手动写入 user_message 或 decision
GET  /api/memory/events          — 列表，支持 ?scopeType=&scopeId=&eventType=&limit=&offset=
GET  /api/memory/events/:id      — 单条详情
```

**POST /api/memory/events 请求体：**

```json
{
  "eventType": "user_message",
  "scopeType": "project",
  "scopeId": "demo",
  "payload": { "message": "客户要求登录超时改为 15 分钟" },
  "occurredAt": "2026-05-23T10:00:00.000Z"
}
```

只允许 `user_message` 和 `decision` 两种 eventType 通过此 API 写入，其余类型由 Control Plane 内部写入。

## 4. Episode 和 Fact 生成（LLM 辅助）

### 4.1 触发机制

每次写入 Raw Event 后，Control Plane 异步触发一次 `memory` 命令类型的 headless run（不阻塞写入响应）。

触发逻辑：

1. 检查同一 scope 是否已有 `memory` run 在运行（`status = 'running'`）。
2. 若有，跳过本次触发（不排队，下次事件再触发）。
3. 若无，启动 `memory` run，patchPhase 为 `compress`。

### 4.2 memory compress prompt 模板

```
[memory/compress] scope: {scopeType}/{scopeId}，资产目录：{claudeAssetsDir}

你是记忆压缩 Agent。请完成以下任务：

## 输入

最近未处理的 Raw Events（JSON）：
{recentEventsJson}

已有 Episodes（最近 10 条，JSON）：
{recentEpisodesJson}

已有 active Facts（JSON）：
{activeFactsJson}

## 任务 1：生成 Episodes

将上述 Raw Events 按阶段分组，每组生成一个 Episode。
每个 Episode 必须包含：
- title：一句话标题
- summary：2-5 句摘要，说明发生了什么
- event_ids：本 Episode 覆盖的 Raw Event id 列表
- artifact_paths：相关产物路径列表（可为空数组）
- conclusion：结论或决策，一句话
- valid_from：本 Episode 覆盖的最早事件时间

## 任务 2：提取或更新 Facts

从 Episodes 中提取可复用事实。对每个 Fact：
- fact_type：user_preference / project_constraint / architecture_decision / delivery_fact / risk_fact / lesson_fact
- content：事实内容，自然语言，一句话
- source_event_ids：来源 Raw Event id 列表
- source_paths：来源文件路径列表（可为空数组）
- confidence：0.0–1.0
- valid_from：生效时间（ISO 8601）
- expires_at：过期时间（ISO 8601），永不过期填 null
- supersedes_id：若本 Fact 替代已有 Fact，填其 id，否则填 null

## 输出格式

输出严格 JSON，不含任何其他文字：

{
  "episodes": [...],
  "facts": [...],
  "processedEventIds": [...]
}

processedEventIds 是本次处理的所有 Raw Event id，用于标记已处理。
```

### 4.3 结果处理

`memory compress` run 完成后，Control Plane 读取 run 的 stdout（JSON），解析后：

1. 将 `episodes` 数组逐条写入 `episodes` 表。
2. 将 `facts` 数组逐条写入 `facts` 表：
   - 若 `supersedes_id` 非 null，将被替代的 Fact status 更新为 `superseded`。
   - 若同一 scope + content 已存在 active Fact，更新 confidence 和 expires_at，不重复插入。
3. 检查 `facts` 表中 `expires_at < now()` 的记录，status 更新为 `expired`。
4. 触发 Retrieval Pack 重新生成（见第 5 节）。

### 4.4 错误处理

- LLM run 失败（exitCode ≠ 0）：记录错误日志，不更新任何记忆表，下次事件触发时重试。
- JSON 解析失败：同上。
- 部分 Fact 写入失败：跳过该条，继续写入其余条目，记录警告日志。

## 5. Retrieval Pack 生成

### 5.1 触发机制

Episode/Fact 生成完成后，Control Plane 异步触发 `memory` 命令类型的 headless run，patchPhase 为 `pack`。

同样检查同一 scope 是否已有 `pack` run 在运行，若有则跳过。

### 5.2 memory pack prompt 模板

```
[memory/pack] scope: {scopeType}/{scopeId}，资产目录：{claudeAssetsDir}

你是 Retrieval Pack 生成 Agent。请为下一次 Runner 启动生成精准的上下文包。

## 输入

当前任务目标（来自最近 command_run 事件）：
{currentGoal}

当前 scope 关键状态：
{scopeStatus}

最近相关 Episodes（最近 5 条，JSON）：
{recentEpisodesJson}

Active Facts（JSON）：
{activeFactsJson}

相关 lessons（文件路径列表）：
{lessonPaths}

Governance 摘要：
{governanceSummary}

## 任务

生成 Retrieval Pack，内容上限小而准，总字数不超过 2000 字。

必须包含：
1. current_goal：当前任务目标，一句话
2. scope_status：当前 scope 关键状态摘要
3. recent_episodes：最相关的 3 条 Episode 摘要
4. active_facts：所有 active Facts（按 confidence 降序，最多 10 条）
5. lesson_hints：相关 lesson 文件路径列表（最多 5 条）
6. governance_notes：必须遵守的 governance 要点（最多 3 条）
7. excluded：明确排除的过期或被替代信息列表

## 输出格式

输出严格 JSON，不含任何其他文字：

{
  "current_goal": "...",
  "scope_status": "...",
  "recent_episodes": [...],
  "active_facts": [...],
  "lesson_hints": [...],
  "governance_notes": [...],
  "excluded": [...],
  "episode_ids": [...],
  "fact_ids": [...]
}
```

### 5.3 Pack 写入与过期

Pack 生成完成后写入 `retrieval_packs` 表：
- `expires_at = generated_at + 30 分钟`。
- 同一 scope 的旧 Pack 不删除，保留历史（便于复盘）。

### 5.4 Runner 启动时注入 Pack

`POST /api/runs` 和 `POST /api/change-requests/:id/execute-patch` 启动 Runner 前：

1. 查询 `retrieval_packs` 表，找同一 scope 最新且未过期的 Pack。
2. 若找到，将 Pack content 注入 headless prompt 前缀：

```
[retrieval-pack]
{packContent}
[/retrieval-pack]

```

3. 将 Pack 的 `run_id` 更新为本次 run id（标记"此 Pack 被哪次 run 使用"）。
4. 若未找到有效 Pack，Runner 正常启动，不注入（降级，不阻塞）。

## 6. 文件系统 Watcher

### 6.1 实现

新建 `control-plane/src/watcher/statusWatcher.js`。

```js
function createStatusWatcher({ projectsDir, store, onEvent, debounceMs = 500 }) { ... }
```

- 使用 `fs.watch(projectsDir, { recursive: true })` 监听目录变更。
- 过滤只处理文件名为 `.status.json` 的变更。
- 防抖 500ms：同一文件在 500ms 内多次触发只处理最后一次。
- 读取变更前后的 JSON，对比 `phase` 和 `status` 字段，生成 `file_changed` Raw Event。
- 调用 `onEvent(event)` 回调，由 server.js 负责写入 store 并触发 compress。

### 6.2 server.js 集成

`server.js` 在启动时创建 Watcher，传入 `onEvent` 回调：

```js
const watcher = createStatusWatcher({
  projectsDir: config.projectsDir,
  store,
  onEvent: event => {
    store.createRawEvent(event);
    triggerMemoryCompress(event.scopeId, store, runner, config);
  }
});
```

关闭时调用 `watcher.close()`。

## 7. 新增 API

### 7.1 Raw Events

```
POST /api/memory/events
GET  /api/memory/events
GET  /api/memory/events/:id
```

### 7.2 Episodes

```
GET  /api/memory/episodes
GET  /api/memory/episodes/:id
```

### 7.3 Facts

```
GET  /api/memory/facts
GET  /api/memory/facts/:id
PATCH /api/memory/facts/:id/reject   — 用户手动拒绝一条 Fact（status → rejected）
```

### 7.4 Retrieval Packs

```
GET  /api/memory/packs
GET  /api/memory/packs/:id
GET  /api/memory/packs/latest?scopeType=&scopeId=   — 查询最新有效 Pack
```

### 7.5 手动触发压缩

```
POST /api/memory/compress?scopeType=&scopeId=   — 手动触发 compress run（调试用）
```

## 8. commandBuilder 扩展：memory 命令类型

新增 `memory` 命令类型，两个 phase：

**compress phase prompt**：见 4.2，参数：`scopeType, scopeId, recentEventsJson, recentEpisodesJson, activeFactsJson`。

**pack phase prompt**：见 5.2，参数：`scopeType, scopeId, currentGoal, scopeStatus, recentEpisodesJson, activeFactsJson, lessonPaths, governanceSummary`。

`buildClaudeCommand` 对 `memory` 命令走独立分支，不要求 `targetName`，改用 `scopeType + scopeId + memoryPhase`。

## 9. store 扩展

新增以下方法（不修改现有方法）：

```
createRawEvent(event)
listRawEvents({ scopeType?, scopeId?, eventType?, limit, offset })
getRawEvent(id)

createEpisode(episode)
listEpisodes({ scopeType?, scopeId?, limit, offset })
getEpisode(id)

createFact(fact)
updateFactStatus(id, status)
listFacts({ scopeType?, scopeId?, status?, limit, offset })
getFact(id)
expireOldFacts(now)                    — 批量将 expires_at < now 的 Fact 标记为 expired

createRetrievalPack(pack)
getLatestValidPack(scopeType, scopeId, now)   — 最新且 expires_at > now 的 Pack
updatePackRunId(packId, runId)
listPacks({ scopeType?, scopeId?, limit, offset })
getPack(id)
```

## 10. Web Console 记忆中心

在现有迭代中心区块之后追加"记忆中心"区块（不新建页面）。

### 10.1 展示内容

1. **Pack 状态卡**：当前 scope 最新 Pack 的生成时间、过期时间、引用 Episode 数和 Fact 数。若无有效 Pack 显示"未生成"。
2. **Facts 列表**：按 fact_type 分组，展示 content、confidence、status、valid_from/expires_at。过期和 superseded 的 Fact 折叠显示。
3. **Episodes 列表**：按时间倒序，展示 title、summary、conclusion。
4. **Events 列表**：最近 20 条 Raw Events，展示 event_type、scope、occurred_at、payload 摘要。
5. **手动添加事件**：表单，支持 user_message 和 decision 两种类型。
6. **手动触发压缩**：按钮，调用 `POST /api/memory/compress`。

### 10.2 状态徽章颜色

| status | 颜色 |
|--------|------|
| active | success `#54d88a` |
| expired | muted `#8899a6` |
| superseded | muted `#8899a6` |
| rejected | danger `#ff6b6b` |

## 11. 并发与安全约束

1. 同一 scope 同时只允许一个 `memory compress` run 和一个 `memory pack` run。
2. Watcher 防抖 500ms，避免短时间内重复触发。
3. LLM 输出的 JSON 必须经过 schema 校验（检查必填字段类型），校验失败整条丢弃，不写入。
4. `POST /api/memory/events` 只允许 `user_message` 和 `decision` 两种 eventType，其余返回 400。
5. Fact 的 `supersedes_id` 必须指向同一 scope 的已有 Fact，否则忽略该字段。
6. Retrieval Pack content 注入 prompt 时，总长度超过 4000 字符时截断并追加 `[pack truncated]` 标记。

## 12. 阶段落地边界

Phase 3 只实现以下内容：

1. SQLite 四张新表（raw_events / episodes / facts / retrieval_packs）。
2. store 新增记忆相关方法。
3. commandBuilder 扩展 `memory` 命令类型（compress / pack 两个 phase）。
4. runner 支持 `memory` payload。
5. Control Plane 内部自动写入 Raw Events（run 启动/完成、CR 状态变更、index rebuild、gate 变更）。
6. Raw Events API（POST/GET）。
7. Episodes / Facts / Packs 只读 API。
8. Facts reject API。
9. 手动触发 compress API。
10. 文件系统 Watcher（statusWatcher.js）。
11. Runner 启动时注入 Retrieval Pack。
12. Web Console 记忆中心区块。

Phase 3 不实现：

1. Memory Tree 层级 UI。
2. 向量检索。
3. 跨公司记忆隔离。
4. Facts 人工编辑。
5. Episode 人工创建。

## 13. 风险与约束

1. **LLM 输出质量**：compress 和 pack 的质量取决于 prompt 和 Agent 能力，Control Plane 只负责触发和存储，不保证输出质量。JSON schema 校验是最后防线。
2. **Watcher 平台差异**：`fs.watch` 在 Windows 上对网络驱动器和某些文件系统可能不可靠，需在 server.js 中捕获 watcher 错误并降级（不 crash）。
3. **Pack 注入长度**：Retrieval Pack 注入 prompt 会增加 token 消耗，4000 字符截断是保守上限，可通过 config 调整。
4. **compress 跳过逻辑**：若 compress run 长时间运行（>10 分钟），后续事件触发的 compress 会被持续跳过。需在 server.js 中设置 compress run 超时检测（检查 started_at，超过 10 分钟视为僵尸，允许重新触发）。
5. **冷启动**：首次启动时 `retrieval_packs` 为空，Runner 降级启动（不注入 Pack），属于预期行为。

## 14. 自审记录

1. 完整性检查：全文不保留未填写项或临时标记。
2. 一致性检查：所有 API 路径、表名、字段名、命令类型在各节中保持一致。
3. 范围检查：Phase 3 只做记忆系统，Memory Tree UI 和向量检索明确排除。
4. 歧义检查：compress 触发条件、Pack 注入逻辑、Fact supersedes 处理、Watcher 防抖均给出明确约束。
5. 与 Phase 0+2 兼容性：不修改现有八张表、不修改现有 API 语义、不修改现有命令类型。
6. 降级路径：LLM 失败、Pack 未生成、Watcher 不可用均有明确降级行为，不阻塞主流程。
