# 一人开发公司 OS Phase 3 实施计划：记忆系统

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Phase 2 control-plane 基础上实现 Raw Events → Episodes → Facts → Retrieval Pack 记忆系统，LLM 辅助压缩，后台预生成，Runner 启动时注入上下文。

**Spec:** `docs/superpowers/specs/2026-05-23-one-person-dev-company-os-phase-3-design.md`

**Tech Stack:** 与 Phase 0+2 相同：Node.js 20, CommonJS, Express, better-sqlite3, helmet, Vitest, Supertest, vanilla HTML/CSS/JS。

**Worktree:** 在 `H:\claude-assets\.claude\worktrees\one-person-dev-company-os-phase-3` 中工作。

---

## 范围边界

只修改/创建 `control-plane/` 下的文件。不修改 `E:\projects`、`G:\logs`、`G:\qa-reports`。不修改 Phase 0+2 现有八张表和现有 API 语义。

---

## Task 1：扩展 SQLite schema（四张新表）

**TDD 要求：先写测试，再实现。**

- [ ] 新建 `control-plane/tests/db.phase3.test.js`，测试：
  - `raw_events` 表存在，含所有必填字段（id, event_type, scope_type, scope_id, payload, source, occurred_at, created_at）。
  - `episodes` 表存在，含所有必填字段。
  - `facts` 表存在，含所有必填字段，`supersedes_id` 外键约束 → facts.id。
  - `retrieval_packs` 表存在，含所有必填字段。
  - facts 自引用外键：插入 fact A，再插入 fact B（supersedes_id = A.id），删除 A 时 B 的 supersedes_id 置 NULL（ON DELETE SET NULL）。
- [ ] 运行 `npm --prefix ".../control-plane" test -- tests/db.phase3.test.js`，确认 RED。
- [ ] 在 `control-plane/src/db.js` 的 `db.exec(...)` 末尾追加四张表 DDL（见规格 2.1）。facts.supersedes_id 使用 `ON DELETE SET NULL`。
- [ ] 运行测试，确认 GREEN。
- [ ] 运行 `npm run test:coverage`，确认全量通过，覆盖率 ≥ 96%。
- [ ] `git add control-plane/src/db.js control-plane/tests/db.phase3.test.js && git commit -m "feat: add phase 3 sqlite schema"`

---

## Task 2：store 扩展记忆相关方法

**TDD 要求：先写测试，再实现。**

- [ ] 新建 `control-plane/tests/memoryStore.test.js`，覆盖：
  - `createRawEvent(event)` 插入，`getRawEvent(id)` 读回，字段完整（camelCase）。
  - `listRawEvents({ scopeType, scopeId, eventType, limit, offset })` 过滤和分页，按 occurred_at DESC。
  - `createEpisode(episode)` 插入，`getEpisode(id)` 读回。
  - `listEpisodes({ scopeType, scopeId, limit, offset })` 按 valid_from DESC。
  - `createFact(fact)` 插入，`getFact(id)` 读回。
  - `listFacts({ scopeType, scopeId, status, limit, offset })` 过滤 status，按 valid_from DESC。
  - `updateFactStatus(id, status)` 更新 status。
  - `upsertRetrievalPack(pack)` 插入（INSERT OR REPLACE）。
  - `getLatestRetrievalPack(scopeType, scopeId)` 读取最新未过期 Pack（expires_at > now），不存在返回 null。
  - `listRetrievalPacks(scopeType, scopeId, limit)` 按 generated_at DESC。
- [ ] 运行测试，确认 RED。
- [ ] 在 `control-plane/src/store.js` 末尾追加记忆相关方法（不修改现有方法）。
- [ ] 运行测试，确认 GREEN。
- [ ] 运行 `npm run test:coverage`，确认全量通过，覆盖率 ≥ 96%。
- [ ] `git add control-plane/src/store.js control-plane/tests/memoryStore.test.js && git commit -m "feat: add memory store methods"`

---

## Task 3：commandBuilder 扩展 memory 命令类型

**TDD 要求：先写测试，再实现。**

- [ ] 在 `control-plane/tests/commandBuilder.test.js` 末尾追加测试：
  - `buildClaudeCommand({ commandType: 'memory', memoryPhase: 'compress', scopeType: 'project', scopeId: 'demo', claudeAssetsDir, claudeCommand, eventsJson: '[...]', episodesJson: '[...]' })` → prompt 包含 scopeType/scopeId、eventsJson、episodesJson，包含 `OUTPUT_PATH` 占位符。
  - `buildClaudeCommand({ commandType: 'memory', memoryPhase: 'pack', scopeType: 'project', scopeId: 'demo', claudeAssetsDir, claudeCommand, taskGoal: '...', episodesJson: '[...]', factsJson: '[...]' })` → prompt 包含 taskGoal、episodesJson、factsJson。
  - `memory` 命令缺少 `memoryPhase` → 抛错。
  - 未知 `memoryPhase` → 抛错。
  - 现有 intake/go/recover/patch 回归不破坏。
- [ ] 运行测试，确认 RED。
- [ ] 修改 `control-plane/src/runner/commandBuilder.js`：
  - COMMANDS 新增 `'memory'`。
  - `buildClaudeCommand` 对 `memory` 走独立分支，调用 `buildMemoryPrompt`。
  - `buildMemoryPrompt` 实现 compress 和 pack 两个 phase 的 prompt 模板（见规格 4.2 和 4.3）。
  - compress prompt 末尾包含 `OUTPUT_PATH: {outputPath}` 行，Agent 将 JSON 写入该路径。
  - pack prompt 末尾包含 `OUTPUT_PATH: {outputPath}` 行。
- [ ] 运行测试，确认 GREEN。
- [ ] 运行 `npm run test:coverage`，确认全量通过，覆盖率 ≥ 96%。
- [ ] `git add control-plane/src/runner/commandBuilder.js control-plane/tests/commandBuilder.test.js && git commit -m "feat: extend command builder with memory type"`

---

## Task 4：Raw Events 自动写入 + API

**TDD 要求：先写测试，再实现。**

- [ ] 新建 `control-plane/tests/memoryApi.test.js`，覆盖：

  **自动写入（通过 app 内部调用验证）：**
  - `POST /api/runs` 启动 run → 自动写入 `command_run` Raw Event（source: control_plane）。
  - `POST /api/index/rebuild` 完成 → 自动写入 `command_run` Raw Event。
  - `POST /api/change-requests/:id/cancel` → 自动写入 `agent_run` Raw Event（fromStatus/toStatus）。

  **手动写入 API：**
  - `POST /api/memory/events` eventType=user_message → 201，返回 event 对象。
  - `POST /api/memory/events` eventType=decision → 201。
  - `POST /api/memory/events` eventType=command_run（非法）→ 400。
  - `POST /api/memory/events` 缺少必填字段 → 400。
  - `GET /api/memory/events` → 200，`{ events: [...], total }`。
  - `GET /api/memory/events?scopeType=project&scopeId=demo` → 过滤。
  - `GET /api/memory/events/:id` 存在 → 200；不存在 → 404。

- [ ] 运行测试，确认 RED。
- [ ] 在 `control-plane/src/app.js` 中：
  - 新增内部 `writeEvent(store, event)` 函数，在 run 启动/完成、CR 状态变更、index rebuild 完成时调用。
  - 追加 `POST /api/memory/events`（只允许 user_message / decision）。
  - 追加 `GET /api/memory/events`（支持 scopeType/scopeId/eventType/limit/offset 过滤）。
  - 追加 `GET /api/memory/events/:id`。
  - 每次写入 Raw Event 后，`setImmediate(() => triggerCompress(scopeType, scopeId, store, runner, config))` 异步触发压缩。
- [ ] 运行测试，确认 GREEN。
- [ ] 运行 `npm run test:coverage`，确认全量通过，覆盖率 ≥ 96%。
- [ ] `git add control-plane/src/app.js control-plane/tests/memoryApi.test.js && git commit -m "feat: raw events auto-write and api"`

---

## Task 5：compress 触发逻辑 + Episodes/Facts/Packs 只读 API

**TDD 要求：先写测试，再实现。**

- [ ] 在 `control-plane/tests/memoryApi.test.js` 末尾追加测试：

  **compress 触发：**
  - 写入 Raw Event 后，若 runner 可用，compress run 被异步触发（mock runner，验证 start 被调用，commandType='memory', memoryPhase='compress'）。
  - 若已有 memory run 在运行（status='running'，started_at 在 10 分钟内），跳过触发。
  - 若 memory run 僵尸（started_at 超过 10 分钟），允许重新触发。
  - runner 为 null 时，不触发（静默跳过）。

  **compress 完成回调：**
  - compress run 完成（exitCode=0）→ 读取 outputPath 文件，解析 JSON，写入 episodes 和 facts，更新旧 facts status（superseded）。
  - compress run 失败（exitCode≠0）→ 静默跳过，不修改 episodes/facts。
  - outputPath 文件不存在 → 静默跳过。
  - outputPath 文件 JSON 格式非法 → 静默跳过。

  **只读 API：**
  - `GET /api/memory/episodes?scopeType=project&scopeId=demo` → 200，`{ episodes: [...] }`。
  - `GET /api/memory/episodes/:id` 存在 → 200；不存在 → 404。
  - `GET /api/memory/facts?scopeType=project&scopeId=demo&status=active` → 200，`{ facts: [...] }`。
  - `GET /api/memory/facts/:id` 存在 → 200；不存在 → 404。
  - `PATCH /api/memory/facts/:id/reject` → 200，status 变为 rejected。
  - `GET /api/memory/packs?scopeType=project&scopeId=demo` → 200，`{ packs: [...] }`。
  - `GET /api/memory/packs/latest?scopeType=project&scopeId=demo` → 200 或 404（无有效 Pack）。
  - `POST /api/memory/compress` → 202，手动触发 compress。

- [ ] 运行测试，确认 RED。
- [ ] 在 `control-plane/src/app.js` 中追加：
  - `triggerCompress(scopeType, scopeId, store, runner, config)` 函数（含僵尸检测）。
  - compress `onComplete` 回调：读取 outputPath，JSON schema 校验，写入 episodes/facts，处理 supersedes。
  - `GET /api/memory/episodes`、`GET /api/memory/episodes/:id`。
  - `GET /api/memory/facts`、`GET /api/memory/facts/:id`、`PATCH /api/memory/facts/:id/reject`。
  - `GET /api/memory/packs`、`GET /api/memory/packs/latest`。
  - `POST /api/memory/compress`（手动触发）。
- [ ] 运行测试，确认 GREEN。
- [ ] 运行 `npm run test:coverage`，确认全量通过，覆盖率 ≥ 96%。
- [ ] `git add control-plane/src/app.js control-plane/tests/memoryApi.test.js && git commit -m "feat: compress trigger and memory read api"`

---

## Task 6：Retrieval Pack 生成 + Runner 注入

**TDD 要求：先写测试，再实现。**

- [ ] 新建 `control-plane/tests/retrievalPack.test.js`，覆盖：

  **pack 生成触发：**
  - compress 完成后，自动触发 pack 生成（mock runner，验证 start 被调用，commandType='memory', memoryPhase='pack'）。
  - pack run 完成（exitCode=0）→ 读取 outputPath，写入 retrieval_packs，expires_at = generated_at + 30 分钟。
  - pack run 失败 → 静默跳过。

  **Runner 注入：**
  - `POST /api/runs`（commandType='go', targetName='demo'）时，若存在有效 Pack（未过期），prompt 末尾注入 Pack 内容（截断至 4000 字符）。
  - 若无有效 Pack，prompt 不含 Pack 内容（降级）。
  - 注入后 Pack 的 run_id 更新为本次 run id。

  **commandBuilder 回归：**
  - `buildClaudeCommand` 接受可选 `retrievalPack` 参数，注入到 prompt 末尾。
  - 不传 `retrievalPack` 时 prompt 不变（回归）。

- [ ] 运行测试，确认 RED。
- [ ] 修改 `control-plane/src/runner/commandBuilder.js`：
  - `buildPrompt` 接受可选 `retrievalPack` 字符串，若存在则追加到 prompt 末尾（截断至 4000 字符）。
- [ ] 修改 `control-plane/src/runner/claudeRunner.js`：
  - `start(payload)` 时，若 `payload.retrievalPack` 存在，传给 `buildClaudeCommand`。
- [ ] 修改 `control-plane/src/app.js`：
  - `POST /api/runs` 启动前，读取 `store.getLatestRetrievalPack(scopeType, scopeId)`，若存在则注入 payload。
  - compress 完成后，追加触发 pack 生成（`triggerPack`）。
  - pack `onComplete` 回调：写入 retrieval_packs，更新 run_id。
- [ ] 运行测试，确认 GREEN。
- [ ] 运行 `npm run test:coverage`，确认全量通过，覆盖率 ≥ 96%。
- [ ] `git add control-plane/src/app.js control-plane/src/runner/commandBuilder.js control-plane/src/runner/claudeRunner.js control-plane/tests/retrievalPack.test.js && git commit -m "feat: retrieval pack generation and runner injection"`

---

## Task 7：文件系统 Watcher

**TDD 要求：先写测试，再实现。**

- [ ] 新建 `control-plane/tests/statusWatcher.test.js`，覆盖：
  - `createStatusWatcher({ projectsDir, store, onEvent, debounceMs })` 返回 watcher 对象，含 `start()` 和 `stop()` 方法。
  - 监听目录下 `.status.json` 文件变更时，调用 `onEvent` 回调，参数含 `{ eventType: 'file_changed', filePath, oldContent, newContent }`。
  - 防抖：500ms 内多次变更只触发一次 `onEvent`。
  - `stop()` 后不再触发 `onEvent`。
  - 目录不存在时，`start()` 不 crash，返回 null watcher（降级）。
  - `fs.watch` 抛错时，`start()` 捕获错误，返回 null watcher（降级）。
- [ ] 运行测试，确认 RED。
- [ ] 新建 `control-plane/src/indexer/statusWatcher.js`，实现上述逻辑。使用 `fs.watch` + 防抖（setTimeout）。读取文件内容时用 `fs.readFileSync`，解析失败时 oldContent/newContent 为 null。
- [ ] 修改 `control-plane/src/server.js`：
  - 启动时创建 statusWatcher，`onEvent` 回调写入 `file_changed` Raw Event 并触发 compress。
  - 捕获 watcher 错误，降级（不 crash）。
  - 关闭时调用 `watcher.stop()`。
- [ ] 运行测试，确认 GREEN。
- [ ] 运行 `npm run test:coverage`，确认全量通过，覆盖率 ≥ 96%。
- [ ] `git add control-plane/src/indexer/statusWatcher.js control-plane/src/server.js control-plane/tests/statusWatcher.test.js && git commit -m "feat: status file watcher for raw events"`

---

## Task 8：Web Console 记忆中心

**无需 TDD（纯 UI），但需要 publicFiles.test.js 验证关键 DOM id 存在。**

- [ ] 修改 `control-plane/src/public/index.html`：
  - 在迭代中心区块之后追加记忆中心 section（id=`memory-section`）。
  - 包含四个子区块：Raw Events 列表（id=`events-list`）、Episodes 列表（id=`episodes-list`）、Facts 列表（id=`facts-list`）、Retrieval Pack 状态（id=`pack-status`）。
  - 包含"手动添加事件"表单（id=`event-form`，hidden）和"手动触发压缩"按钮（id=`trigger-compress`）。
- [ ] 修改 `control-plane/src/public/styles.css`：
  - 追加记忆中心相关样式（memory-card、fact-card、pack-card、badge 颜色 active/expired/superseded/rejected）。
- [ ] 修改 `control-plane/src/public/app.js`：
  - 追加 `loadMemory()` 函数，并行请求 events/episodes/facts/packs/latest。
  - `renderEventsList(events)`：每条显示 eventType、scopeId、occurred_at、payload 摘要（前 80 字符）。
  - `renderEpisodesList(episodes)`：每条显示 title、summary、valid_from。
  - `renderFactsList(facts)`：每条显示 fact_type、content、confidence、status；active Fact 显示"拒绝"按钮。
  - `renderPackStatus(pack)`：显示 generated_at、expires_at、fact 数量、episode 数量；无 Pack 时显示"尚未生成"。
  - 手动添加事件表单：eventType（user_message/decision）、scopeType、scopeId、payload（textarea）。
  - 手动触发压缩按钮：POST /api/memory/compress，完成后刷新记忆中心。
  - `loadDashboard()` 中追加 `await loadMemory()`。
- [ ] 在 `control-plane/tests/publicFiles.test.js` 中追加验证：`memory-section`、`events-list`、`episodes-list`、`facts-list`、`pack-status` 五个 id 存在。
- [ ] 运行 `npm run test:coverage`，确认全量通过，覆盖率 ≥ 96%。
- [ ] `git add control-plane/src/public/ control-plane/tests/publicFiles.test.js && git commit -m "feat: add memory center to web console"`

---

## Task 9：集成验证

- [ ] 启动服务：`CONTROL_PLANE_PORT=3102 npm run dev`。
- [ ] 验证 `GET /api/health` 返回 ok。
- [ ] 验证 `POST /api/memory/events`（user_message）→ 201，`GET /api/memory/events` 可见。
- [ ] 验证 `POST /api/memory/events`（command_run）→ 400。
- [ ] 验证 `GET /api/memory/packs/latest?scopeType=company&scopeId=default` → 404（冷启动无 Pack）。
- [ ] 验证 Web Console 记忆中心区块正常渲染，控制台无错误。
- [ ] 停止服务。
- [ ] `git add -A && git commit -m "test: phase 3 integration verification"`（若有未提交变更）。

---

## Task 10：合并到 master

- [ ] 运行 `npm run test:coverage`，确认全量通过，覆盖率 ≥ 96%。
- [ ] `git -C "H:/claude-assets" merge --no-ff worktree-one-person-dev-company-os-phase-3 -m "feat(control-plane): Phase 3 记忆系统 MVP"`。
- [ ] 删除 worktree：`git worktree remove ".claude/worktrees/one-person-dev-company-os-phase-3"`。
