# 一人开发公司 OS Phase 2 实施计划：迭代闭环

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Phase 0+1 control-plane 基础上实现 Change Request → Impact Analysis → Patch Plan → Regression → Release 迭代闭环。

**Spec:** `docs/superpowers/specs/2026-05-23-one-person-dev-company-os-phase-2-design.md`

**Tech Stack:** 与 Phase 0+1 相同：Node.js 20, CommonJS, Express, better-sqlite3, helmet, Vitest, Supertest, vanilla HTML/CSS/JS。

**Worktree:** 在 `H:\claude-assets\.claude\worktrees\one-person-dev-company-os-phase-2` 中工作。

---

## 范围边界

只修改/创建 `control-plane/` 下的文件。不修改 `E:\projects`、`G:\logs`、`G:\qa-reports`。不修改 Phase 0+1 现有五张表和现有 API 语义。

---

## Task 1：扩展 SQLite schema（三张新表）

**TDD 要求：先写测试，再实现。**

- [ ] 在 `control-plane/tests/db.phase2.test.js` 中新增测试：
  - `change_requests` 表存在，含所有必填字段，外键约束 project_name → projects.name ON DELETE CASCADE。
  - `cr_documents` 表存在，UNIQUE(cr_id, doc_type)，外键约束 cr_id → change_requests.id ON DELETE CASCADE。
  - `regression_results` 表存在，外键约束 cr_id → change_requests.id ON DELETE CASCADE。
  - 插入 CR 后删除关联 project，CR 被级联删除。
  - 同一 (cr_id, doc_type) 重复插入 cr_documents 报 UNIQUE 冲突。
- [ ] 运行 `npm test -- tests/db.phase2.test.js`，确认 RED。
- [ ] 在 `control-plane/src/db.js` 的 `db.exec(...)` 中追加三张表的 DDL（见规格 2.1）。
- [ ] 运行 `npm test -- tests/db.phase2.test.js`，确认 GREEN。
- [ ] 运行 `npm run test:coverage`，确认全量通过，覆盖率不低于 Phase 0+1 基线（96%）。
- [ ] `git add control-plane/src/db.js control-plane/tests/db.phase2.test.js && git commit -m "feat: add phase 2 sqlite schema"`

---

## Task 2：store 扩展 CR 相关方法

**TDD 要求：先写测试，再实现。**

- [ ] 在 `control-plane/tests/crStore.test.js` 中新增测试，覆盖：
  - `createCr(cr)` 插入一条 CR，`getCr(id)` 能读回，字段完整。
  - `updateCrStatus(id, status, extra)` 更新 status、ia_run_id、patch_run_id、regression_run_id、updated_at。
  - `listCrs(projectName?)` 返回所有 CR，可按 projectName 过滤，按 created_at DESC 排序。
  - `upsertCrDocument(crId, docType, path, summary)` 插入或更新 cr_documents。
  - `getCrDocument(crId, docType)` 读取文档记录。
  - `createRegressionResult(result)` 插入 regression_results。
  - `getLatestRegressionResult(crId)` 读取最新一条。
  - 删除 CR 后，cr_documents 和 regression_results 被级联删除。
- [ ] 运行 `npm test -- tests/crStore.test.js`，确认 RED。
- [ ] 在 `control-plane/src/store.js` 中追加 CR 相关方法（不修改现有方法）。
- [ ] 运行 `npm test -- tests/crStore.test.js`，确认 GREEN。
- [ ] 运行 `npm run test:coverage`，确认全量通过。
- [ ] `git add control-plane/src/store.js control-plane/tests/crStore.test.js && git commit -m "feat: add cr store methods"`

---

## Task 3：commandBuilder 扩展 patch 命令类型

**TDD 要求：先写测试，再实现。**

- [ ] 在 `control-plane/tests/commandBuilder.test.js` 中追加测试：
  - `buildClaudeCommand({ commandType: 'patch', crId, patchPhase: 'ia', agentRole: 'architect', projectName, crPath, iaOutputPath, patchPlanPath, claudeAssetsDir, claudeCommand })` 返回合法 command，prompt 包含 crId、patchPhase、iaOutputPath、patchPlanPath。
  - `buildClaudeCommand({ commandType: 'patch', patchPhase: 'execute', crId, projectName, patchPlanPath, iaPath, claudeAssetsDir, claudeCommand })` prompt 包含 patchPlanPath、iaPath。
  - `buildClaudeCommand({ commandType: 'patch', patchPhase: 'regression', crId, projectName, testCommand, claudeAssetsDir, claudeCommand })` prompt 包含 testCommand。
  - `buildClaudeCommand({ commandType: 'patch', patchPhase: 'release', crId, projectName, releaseNotePath, claudeAssetsDir, claudeCommand })` prompt 包含 releaseNotePath。
  - `patch` 命令不需要 targetName，但 `intake/go/recover` 仍需要 targetName（回归）。
  - 未知 patchPhase 抛错。
- [ ] 运行 `npm test -- tests/commandBuilder.test.js`，确认 RED（新增用例失败）。
- [ ] 修改 `control-plane/src/runner/commandBuilder.js`：
  - COMMANDS 新增 `'patch'`。
  - `buildClaudeCommand` 对 `patch` 命令走独立分支，不要求 targetName，改用 crId + patchPhase。
  - 四个 patchPhase 各有独立 prompt 模板（见规格 3.4）。
- [ ] 运行 `npm test -- tests/commandBuilder.test.js`，确认 GREEN。
- [ ] 运行 `npm run test:coverage`，确认全量通过。
- [ ] `git add control-plane/src/runner/commandBuilder.js control-plane/tests/commandBuilder.test.js && git commit -m "feat: extend command builder with patch type"`

---

## Task 4：runner 支持 patch payload 和完成回调

**TDD 要求：先写测试，再实现。**

- [ ] 在 `control-plane/tests/claudeRunner.test.js` 中追加测试：
  - `runner.start({ commandType: 'patch', crId: 'cr-1', patchPhase: 'ia', agentRole: 'architect', projectName: 'demo', crPath: '/tmp/cr.md', iaOutputPath: '/tmp/ia.md', patchPlanPath: '/tmp/patch.md' })` 能正常 spawn，run 记录 commandType 为 `patch`，targetName 为 crId。
  - `onComplete` 回调（若提供）在 run 完成后被调用，参数含 `{ id, status, exitCode }`。
  - `patch` payload 缺少 crId 时抛错。
- [ ] 运行 `npm test -- tests/claudeRunner.test.js`，确认 RED（新增用例失败）。
- [ ] 修改 `control-plane/src/runner/claudeRunner.js`：
  - `start` 接受扩展 payload，`patch` 命令时 targetName 存 crId。
  - 支持可选 `onComplete(runResult)` 回调，在 `finish()` 后调用。
- [ ] 运行 `npm test -- tests/claudeRunner.test.js`，确认 GREEN。
- [ ] 运行 `npm run test:coverage`，确认全量通过。
- [ ] `git add control-plane/src/runner/claudeRunner.js control-plane/tests/claudeRunner.test.js && git commit -m "feat: runner supports patch payload and onComplete callback"`

---

## Task 5：CR CRUD API

**TDD 要求：先写测试，再实现。**

- [ ] 新建 `control-plane/tests/crApi.test.js`，覆盖：
  - `POST /api/change-requests` 合法 body → 201，返回 CR 对象，status 为 `open`。
  - `POST /api/change-requests` 缺少必填字段 → 400。
  - `POST /api/change-requests` projectName 不存在 → 404。
  - `GET /api/change-requests` → 200，返回 `{ changeRequests: [...] }`。
  - `GET /api/change-requests?projectName=demo` → 只返回该项目的 CR。
  - `GET /api/change-requests/:id` 存在 → 200，含 CR 详情和 documents。
  - `GET /api/change-requests/:id` 不存在 → 404。
  - `PATCH /api/change-requests/:id/cancel` → 200，status 变为 `cancelled`。
  - `PATCH /api/change-requests/:id/cancel` 已 released → 400（不允许取消已发布的 CR）。
- [ ] 运行 `npm test -- tests/crApi.test.js`，确认 RED。
- [ ] 在 `control-plane/src/app.js` 中追加 CR CRUD 路由（不修改现有路由）。
  - `POST /api/change-requests`：校验必填字段，检查 projectName 存在，生成 UUID，插入 CR，**异步**触发 IA（不等待）。
  - `GET /api/change-requests`：支持 `?projectName=` 过滤。
  - `GET /api/change-requests/:id`：返回 CR + documents + 最新 regression result。
  - `PATCH /api/change-requests/:id/cancel`：检查 status 不为 released，更新为 cancelled。
- [ ] 运行 `npm test -- tests/crApi.test.js`，确认 GREEN。
- [ ] 运行 `npm run test:coverage`，确认全量通过。
- [ ] `git add control-plane/src/app.js control-plane/tests/crApi.test.js && git commit -m "feat: add cr crud api"`

---

## Task 6：IA 触发、状态机推进、execute-patch API

**TDD 要求：先写测试，再实现。**

- [ ] 在 `control-plane/tests/crWorkflow.test.js` 中新增测试，覆盖：
  - `POST /api/change-requests/:id/trigger-ia`：CR status 为 `open` → 202，status 变为 `ia_running`，ia_run_id 被记录。
  - `POST /api/change-requests/:id/trigger-ia`：CR status 为 `ia_running` → 409（已在运行）。
  - `POST /api/change-requests/:id/trigger-ia`：CR 不存在 → 404。
  - IA run 完成（mock runner onComplete）→ CR status 变为 `ia_done`，cr_documents 中写入 ia 和 patch_plan 记录。
  - IA run 失败（exitCode ≠ 0）→ CR status 回到 `open`，errorMessage 记录。
  - `POST /api/change-requests/:id/execute-patch`：CR status 为 `ia_done` → 202，status 变为 `patch_running`。
  - `POST /api/change-requests/:id/execute-patch`：CR status 不为 `ia_done` 或 `patch_pending` → 400。
  - `POST /api/change-requests/:id/execute-patch`：cr_documents 中无 patch_plan → 400。
  - Patch run 完成 → 自动触发 regression（status 变为 `regression_running`）。
  - Patch run 失败 → CR status 变为 `patch_pending`。
  - 同一项目已有 `patch_running` 时，再次 execute-patch → 409。
- [ ] 运行 `npm test -- tests/crWorkflow.test.js`，确认 RED。
- [ ] 在 `control-plane/src/app.js` 中追加：
  - `POST /api/change-requests/:id/trigger-ia`：路由判断（技术关键词 → architect，否则 pm），构造 patch payload，调用 runner，注册 onComplete 回调推进状态机。
  - `POST /api/change-requests/:id/execute-patch`：前置检查，调用 runner，注册 onComplete 回调。
  - 状态机推进逻辑提取为独立函数 `advanceCrOnRunComplete(store, crId, patchPhase, runResult, config)`，便于测试。
- [ ] 运行 `npm test -- tests/crWorkflow.test.js`，确认 GREEN。
- [ ] 运行 `npm run test:coverage`，确认全量通过。
- [ ] `git add control-plane/src/app.js control-plane/tests/crWorkflow.test.js && git commit -m "feat: add ia trigger and patch execution workflow"`

---

## Task 7：Regression 触发与 Release Note 生成

**TDD 要求：先写测试，再实现。**

- [ ] 在 `control-plane/tests/crRegression.test.js` 中新增测试，覆盖：
  - `POST /api/change-requests/:id/trigger-regression`：CR status 为 `patch_pending` 或 `ia_done` → 202，status 变为 `regression_running`。
  - `POST /api/change-requests/:id/trigger-regression`：CR status 不合法 → 400。
  - Regression run 完成，报告文件含 `PASS` → CR status 变为 `released`，regression_results 写入通过记录，cr_documents 写入 release_note。
  - Regression run 完成，报告文件含 `FAIL` → CR status 变为 `patch_pending`，regression_results 写入失败记录。
  - Regression run 失败（exitCode ≠ 0）→ CR status 变为 `patch_pending`。
- [ ] 运行 `npm test -- tests/crRegression.test.js`，确认 RED。
- [ ] 在 `control-plane/src/app.js` 中追加：
  - `POST /api/change-requests/:id/trigger-regression`：构造 `patch` + `patchPhase: 'regression'` payload，调用 runner，注册 onComplete 回调。
  - `advanceCrOnRunComplete` 扩展 regression 和 release 阶段处理。
  - Release Note 生成：`patchPhase: 'release'` run 完成后，读取 releaseNotePath 文件，写入 cr_documents。
- [ ] 运行 `npm test -- tests/crRegression.test.js`，确认 GREEN。
- [ ] 运行 `npm run test:coverage`，确认全量通过。
- [ ] `git add control-plane/src/app.js control-plane/tests/crRegression.test.js && git commit -m "feat: add regression and release workflow"`

---

## Task 8：Web Console 迭代中心页面

**TDD 要求：先写静态文件测试，再实现。**

- [ ] 在 `control-plane/tests/publicFiles.test.js` 中追加断言：
  - `index.html` 包含 `id="cr-section"`、`id="cr-form"`、`id="cr-list"`。
  - `app.js` 包含 `fetchChangeRequests`、`submitCr`、`executePatch`。
  - `app.js` 不包含 `scrollIntoView`（回归）。
  - `styles.css` 包含 `--color-warning`、`--color-success`（新增 CSS 变量）。
- [ ] 运行 `npm test -- tests/publicFiles.test.js`，确认 RED（新增断言失败）。
- [ ] 修改 `control-plane/src/public/index.html`：
  - 在现有 `<main class="layout">` 中追加迭代中心 section：
    - CR 创建表单（projectName 下拉、title、source、scope、currentBehavior、expectedBehavior、acceptanceCriteria textarea、priority）。
    - CR 列表，按状态分组，每条 CR 显示标题、状态徽章、项目名、创建时间。
    - CR 详情展开区：IA 文档链接、Patch Plan 链接、Regression 结果、Release Note 链接。
    - 操作按钮：`ia_done` 时显示"执行 Patch"，`patch_pending` 时显示"重新执行 Patch"，`open` 时显示"重触发 IA"。
- [ ] 修改 `control-plane/src/public/styles.css`：
  - 新增 `--color-warning: #f4a261`、`--color-success: #00ba7c`。
  - 状态徽章样式：running → primary blue，ia_done/patch_pending → warning，released → success，cancelled → muted。
- [ ] 修改 `control-plane/src/public/app.js`：
  - 新增 `fetchChangeRequests()`、`submitCr(formData)`、`executePatch(crId)`、`triggerIa(crId)`、`renderCrList(crs)`、`renderCrStatus(status)` 函数。
  - `loadDashboard()` 同时加载 CR 列表。
  - 所有 DOM 写入使用 `textContent`/`createElement`，不使用 `innerHTML`。
- [ ] 运行 `npm test -- tests/publicFiles.test.js`，确认 GREEN。
- [ ] 运行 `npm run test:coverage`，确认全量通过。
- [ ] `git add control-plane/src/public control-plane/tests/publicFiles.test.js && git commit -m "feat: add iteration center ui"`

---

## Task 9：启动验证与 smoke

- [ ] 运行 `npm run test:coverage`，确认 12+ test files，全量通过，覆盖率 ≥ 96%。
- [ ] 运行 `npm run audit:prod`，确认 0 漏洞。
- [ ] 启动服务：`CONTROL_PLANE_PORT=3100 npm run dev`。
- [ ] 运行 `npm run smoke`，确认 health 返回 `{ ok: true }`。
- [ ] 浏览器打开 `http://127.0.0.1:3100`，确认：
  - 控制台 0 错误 0 警告。
  - 迭代中心 section 可见，CR 表单可填写。
  - 提交一条测试 CR，列表出现新条目，status 为 `open` 或 `ia_running`。
- [ ] 停止服务，清理 `control-plane/data/`。
- [ ] `git add -A && git commit -m "chore: phase 2 smoke verified"` （如有未提交变更）

---

## Task 10：最终整体验证与合并

- [ ] 运行 `npm run test:coverage`，最终确认全量通过。
- [ ] 运行 `npm run audit:prod`，确认 0 漏洞。
- [ ] 代码审查：检查 XSS（innerHTML）、命令注入（patch prompt 拼接）、SQLite 参数化、并发 CR 保护、状态机边界。
- [ ] 合并到 master：`git checkout master && git merge --no-ff <branch> -m "feat(control-plane): Phase 2 迭代闭环"`。

---

## 验收矩阵

| # | 验收标准 | 测试文件 |
|---|----------|----------|
| A1 | POST /api/change-requests 创建 CR，status 为 open | crApi.test.js |
| A2 | CR 创建后自动触发 IA，status 变为 ia_running | crWorkflow.test.js |
| A3 | IA 完成后 status 变为 ia_done，cr_documents 含 ia 和 patch_plan | crWorkflow.test.js |
| A4 | IA 失败后 status 回到 open | crWorkflow.test.js |
| A5 | execute-patch 前置检查：status 必须为 ia_done 或 patch_pending | crWorkflow.test.js |
| A6 | Patch 完成后自动触发 Regression | crWorkflow.test.js |
| A7 | Regression 通过后 status 变为 released，生成 release_note | crRegression.test.js |
| A8 | Regression 失败后 status 变为 patch_pending | crRegression.test.js |
| A9 | 同一项目并发 patch_running 时 execute-patch 返回 409 | crWorkflow.test.js |
| A10 | Web Console 迭代中心可见，CR 表单可提交 | publicFiles.test.js + 浏览器验证 |
| A11 | 全量测试通过，覆盖率 ≥ 96% | npm run test:coverage |
| A12 | 0 生产依赖漏洞 | npm run audit:prod |
| A13 | 不修改 E:/projects、G:/logs、G:/qa-reports | 代码审查 |
| A14 | Phase 0+1 现有 API 行为不变（回归） | 全量测试 |
