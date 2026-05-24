# P0-P5 Control Plane Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Control Plane to a green, integrated state and complete P0-P5: schema compatibility, four-level hierarchy, product-tree UI, concurrency locks, scoped runner commands, and documentation convergence.

**Architecture:** Keep the file system as delivery truth and SQLite as a rebuildable control-plane index. Use one runtime path: `control-plane/src/app.js` + `control-plane/src/store.js` + `control-plane/src/runner/*`; independent helper modules may remain only if the main app imports them. Preserve legacy `/intake`, `/go`, `/recover`, dashboard, CR, and memory behavior while adding Product/Milestone/Workstream/Task.

**Tech Stack:** Node.js, Express, better-sqlite3, Vitest, Supertest, vanilla HTML/CSS/JS.

---

## File Structure

- Modify: `control-plane/src/db.js` — authoritative SQLite schema and gates migration.
- Modify: `control-plane/src/store.js` — authoritative runtime store for legacy project indexing, CRs, memory, hierarchy, and gates compatibility.
- Modify: `control-plane/src/app.js` — authoritative Express API, runner entrypoint, hierarchy endpoints, locks.
- Modify: `control-plane/src/runner/commandBuilder.js` — authoritative headless Claude command builder.
- Modify: `control-plane/src/runner/claudeRunner.js` — authoritative runner process wrapper.
- Move/Create: `control-plane/src/concurrencyControl.js` — runtime lock manager used by `app.js` / runner paths.
- Modify: `control-plane/src/public/index.html` — Web Console shell.
- Modify: `control-plane/src/public/app.js` — Web Console behavior.
- Modify: `control-plane/src/public/styles.css` — Web Console layout and product tree styles.
- Modify tests under `control-plane/tests/*.test.js` — update legacy expectations and add coverage for new runtime path.
- Remove or ignore accidental nested files under `control-plane/control-plane/` after moving useful code.
- Modify docs under `docs/` and `docs/superpowers/*` — align Phase 4 scope.

---

### Task 1: P0 restore schema compatibility and green tests

**Files:**
- Modify: `control-plane/src/store.js:14-24,110-115,466-481`
- Modify: `control-plane/tests/db.test.js:21-43,120-130`
- Modify: `control-plane/tests/publicFiles.test.js:10-35`

- [ ] **Step 1: Update legacy gates statements in `store.js`**

Replace the old `project_name/name` gates delete/insert/list statements with project-scope mappings:

```js
const deleteGates = db.prepare('DELETE FROM gates WHERE scope_type = ? AND scope_id = ?');
const insertGate = db.prepare(`
  INSERT INTO gates (scope_type, scope_id, gate_name, status, evidence_path, checked_at)
  VALUES ('project', @projectName, @name, @status, @evidencePath, datetime('now'))
  ON CONFLICT(scope_type, scope_id, gate_name) DO UPDATE SET
    status = excluded.status,
    evidence_path = excluded.evidence_path,
    checked_at = excluded.checked_at
`);
```

Change `replaceProjectIndexPayload()` gate deletion to:

```js
deleteGates.run('project', payload.project.name);
```

Change legacy `listGates(projectName)` to:

```js
listGates: projectName => db.prepare(`
  SELECT scope_id AS projectName, gate_name AS name, status, evidence_path AS evidencePath, checked_at AS checkedAt
  FROM gates
  WHERE scope_type = 'project' AND scope_id = ?
  ORDER BY gate_name ASC
`).all(projectName),
```

- [ ] **Step 2: Run focused legacy DB/CR tests and confirm the original error is gone**

Run:

```bash
npm --prefix control-plane test -- tests/db.test.js tests/crStore.test.js
```

Expected: no `no such column: project_name` errors. If tests still fail, fix only the direct schema compatibility issue shown by the output.

- [ ] **Step 3: Update `tests/db.test.js` schema table expectation**

Include the Phase 4 tables in the expected table list:

```js
expect(tables).toEqual([
  'agents',
  'artifacts',
  'change_requests',
  'cr_documents',
  'episodes',
  'facts',
  'gates',
  'milestones',
  'products',
  'projects',
  'raw_events',
  'regression_results',
  'retrieval_packs',
  'runs',
  'sqlite_sequence',
  'tasks',
  'workstreams'
]);
```

- [ ] **Step 4: Update public shell tests to match the new layout**

In `control-plane/tests/publicFiles.test.js`, replace old shell assertions with:

```js
expect(html).toContain('<div class="app-layout">');
expect(html).toContain('class="sidebar"');
expect(html).toContain('id="view-dashboard"');
expect(html).toContain('id="view-products"');
expect(html).toContain('id="products-tree"');
expect(html).toContain('id="rebuild-index"');
expect(html).toContain('rel="icon"');
expect(html).toContain('href="data:,"');
expect(js).toContain('fetchJson');
expect(js).not.toContain('scrollIntoView');
expect(css).toContain('--color-primary: #1d9bf0');
expect(css).toContain('text-wrap: pretty');
```

Update iteration center assertions to new IDs:

```js
expect(html).toContain('id="view-iterations"');
expect(html).toContain('id="cr-form"');
expect(html).toContain('id="cr-list"');
```

Update memory center assertions to new IDs:

```js
expect(html).toContain('id="view-memory"');
expect(html).toContain('id="memory-events-panel"');
expect(html).toContain('id="memory-facts-panel"');
expect(html).toContain('id="memory-pack-panel"');
expect(html).toContain('id="memory-compress-btn"');
```

- [ ] **Step 5: Run full test suite**

Run:

```bash
npm --prefix control-plane test
```

Expected: all tests pass. If failures remain, fix only regressions caused by Phase 4 schema/layout changes before moving to P1.

---

### Task 2: P1 unify four-level hierarchy onto the runtime path

**Files:**
- Modify: `control-plane/src/store.js`
- Modify: `control-plane/src/app.js`
- Modify: `control-plane/tests/hierarchyApi.test.js`
- Modify: `control-plane/tests/gateStore.test.js` or replace with main-store tests

- [ ] **Step 1: Add `getProductTree()` and complete CRUD methods to `store.js`**

Add runtime store methods matching the independent store behavior:

```js
getProductTree: productId => {
  const product = store.getProduct(productId);
  if (!product) return null;
  const milestones = store.listMilestones(productId).map(milestone => ({
    ...milestone,
    workstreams: store.listWorkstreams(milestone.id).map(workstream => ({
      ...workstream,
      tasks: store.listTasks(workstream.id),
      gates: store.listGatesByScope('workstream', workstream.id)
    })),
    gates: store.listGatesByScope('milestone', milestone.id)
  }));
  return { ...product, milestones, gates: store.listGatesByScope('product', productId) };
},
```

Implement it without self-referencing `store` before initialization; if necessary, define helper functions above `return` and expose them in the returned object.

- [ ] **Step 2: Add runtime PATCH/DELETE hierarchy endpoints in `app.js`**

Add endpoints:

```text
PATCH  /api/products/:id
DELETE /api/products/:id
PATCH  /api/milestones/:id
DELETE /api/milestones/:id
PATCH  /api/workstreams/:id
DELETE /api/workstreams/:id
PATCH  /api/tasks/:id
DELETE /api/tasks/:id
GET    /api/products/:id/tree
POST   /api/gates
GET    /api/gates?scopeType=...&scopeId=...
```

Keep existing response envelopes used by the current UI where they already exist. For new generic gates API, return `{ success: true }` for POST and `{ gates }` for GET.

- [ ] **Step 3: Enforce milestone release guard in runtime API**

In `PATCH /api/milestones/:id`, if body status is `released`, read workstreams for that milestone and reject when any has `status === 'blocked'`:

```js
if (status === 'released') {
  const hasBlocked = store.listWorkstreams(req.params.id).some(workstream => workstream.status === 'blocked');
  if (hasBlocked) {
    res.status(400).json({ error: 'cannot release milestone with blocked workstreams' });
    return;
  }
}
```

- [ ] **Step 4: Move hierarchy API tests to the real app**

Update `control-plane/tests/hierarchyApi.test.js` to create `createApp({ config, store, indexer, runner: null, watcherFactory: null })` instead of using `registerHierarchyApi()` directly. Adapt response envelopes:

```js
const res = await request(app).get('/api/products').expect(200);
expect(res.body.products).toHaveLength(2);
```

For tree:

```js
const res = await request(app).get(`/api/products/${productId}/tree`).expect(200);
expect(res.body.product.name).toBe('Product A');
expect(res.body.product.milestones[0].workstreams[0].tasks).toHaveLength(2);
```

- [ ] **Step 5: Run hierarchy tests and full tests**

Run:

```bash
npm --prefix control-plane test -- tests/hierarchyApi.test.js tests/db.phase4.test.js
npm --prefix control-plane test
```

Expected: both commands pass.

---

### Task 3: P2 finish product-tree Web Console behavior

**Files:**
- Modify: `control-plane/src/public/app.js`
- Modify: `control-plane/src/public/index.html`
- Modify: `control-plane/src/public/styles.css`
- Modify: `control-plane/tests/publicFiles.test.js`

- [ ] **Step 1: Add view switching in `app.js`**

Add element bindings:

```js
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');

function switchView(viewName) {
  navItems.forEach(item => item.classList.toggle('active', item.dataset.view === viewName));
  views.forEach(view => {
    const isActive = view.id === `view-${viewName}`;
    view.classList.toggle('active', isActive);
    view.hidden = !isActive;
  });
  if (viewName === 'products') loadProducts();
  if (viewName === 'memory') loadMemory();
  if (viewName === 'iterations') loadCrs();
}

navItems.forEach(item => item.addEventListener('click', () => switchView(item.dataset.view)));
```

- [ ] **Step 2: Add product tree state and element bindings**

Add:

```js
const productElements = {
  tree: document.getElementById('products-tree'),
  newProductBtn: document.getElementById('new-product-btn'),
  productDialog: document.getElementById('product-dialog'),
  productForm: document.getElementById('product-form'),
  productName: document.getElementById('product-name'),
  productDescription: document.getElementById('product-description'),
  productTargetDate: document.getElementById('product-target-date'),
  milestoneDialog: document.getElementById('milestone-dialog'),
  milestoneForm: document.getElementById('milestone-form'),
  milestoneProductId: document.getElementById('milestone-product-id'),
  milestoneName: document.getElementById('milestone-name'),
  milestoneTargetDate: document.getElementById('milestone-target-date'),
  workstreamDialog: document.getElementById('workstream-dialog'),
  workstreamForm: document.getElementById('workstream-form'),
  workstreamMilestoneId: document.getElementById('workstream-milestone-id'),
  workstreamName: document.getElementById('workstream-name'),
  workstreamProjectName: document.getElementById('workstream-project-name'),
  taskDialog: document.getElementById('task-dialog'),
  taskForm: document.getElementById('task-form'),
  taskWorkstreamId: document.getElementById('task-workstream-id'),
  taskTitle: document.getElementById('task-title'),
  taskAgentRole: document.getElementById('task-agent-role'),
  taskAcceptance: document.getElementById('task-acceptance')
};
```

- [ ] **Step 3: Implement `loadProducts()` and tree rendering with DOM APIs**

Use `textContent`, not `innerHTML`, for user-controlled names:

```js
async function loadProducts() {
  const data = await fetchJson('/api/products');
  const products = data.products || [];
  productElements.tree.replaceChildren();
  if (products.length === 0) {
    productElements.tree.appendChild(emptyMessage('暂无产品。'));
    return;
  }
  for (const product of products) {
    const tree = await fetchJson(`/api/products/${product.id}/tree`);
    productElements.tree.appendChild(renderProductNode(tree.product || tree));
  }
}
```

Each node should show name/status and buttons: add milestone, add workstream, add task. Buttons open the corresponding dialog with hidden parent id filled.

- [ ] **Step 4: Implement create forms**

Product submit:

```js
await fetchJson('/api/products', {
  method: 'POST',
  body: JSON.stringify({ name: productElements.productName.value.trim() })
});
```

Milestone submit:

```js
await fetchJson(`/api/products/${productElements.milestoneProductId.value}/milestones`, {
  method: 'POST',
  body: JSON.stringify({ name: productElements.milestoneName.value.trim(), targetDate: productElements.milestoneTargetDate.value || null })
});
```

Workstream submit:

```js
await fetchJson(`/api/milestones/${productElements.workstreamMilestoneId.value}/workstreams`, {
  method: 'POST',
  body: JSON.stringify({ name: productElements.workstreamName.value.trim(), projectName: productElements.workstreamProjectName.value.trim() || null })
});
```

Task submit:

```js
await fetchJson(`/api/workstreams/${productElements.taskWorkstreamId.value}/tasks`, {
  method: 'POST',
  body: JSON.stringify({
    title: productElements.taskTitle.value.trim(),
    agentRole: productElements.taskAgentRole.value,
    acceptanceRef: productElements.taskAcceptance.value.trim() || null
  })
});
```

After each successful submit: close dialog, reset form, reload product tree.

- [ ] **Step 5: Add styles and tests**

Add CSS classes for `.tree-node`, `.tree-node-header`, `.tree-children`, `.status-chip`, `.node-actions`.

Update `publicFiles.test.js` to assert `switchView`, `loadProducts`, and `products-tree` are present.

- [ ] **Step 6: Run tests and browser verification**

Run:

```bash
npm --prefix control-plane test
npm --prefix control-plane start
```

Open `http://127.0.0.1:3100`, verify dashboard loads, product tab loads, and creating Product → Milestone → Workstream → Task works.

---

### Task 4: P3 wire concurrency control into runtime

**Files:**
- Move: `control-plane/control-plane/src/concurrencyControl.js` → `control-plane/src/concurrencyControl.js`
- Move/Adapt: `control-plane/control-plane/tests/concurrencyControl.test.js` → `control-plane/tests/concurrencyControl.test.js`
- Modify: `control-plane/src/app.js`
- Modify: `control-plane/src/runner/claudeRunner.js`
- Add/Modify tests for `/api/runs` conflict behavior.

- [ ] **Step 1: Move concurrency control into the real source tree**

Move the file content exactly, then delete the accidental nested `control-plane/control-plane` directory if empty.

- [ ] **Step 2: Add runtime lock dependency**

In `app.js`, import and create default control:

```js
const { createConcurrencyControl } = require('./concurrencyControl');
```

Inside `createApp()`:

```js
const concurrency = dependencies.concurrency || createConcurrencyControl();
```

- [ ] **Step 3: Extend run payload validation for scope metadata**

Allow optional fields:

```js
scopeType, scopeId, projectPath, workstreamId, taskId, isReadOnly
```

Keep legacy `intake/go/recover` validation unchanged.

- [ ] **Step 4: Acquire and release locks around runner.start**

Before `runner.start(runPayload)`:

```js
const scope = {
  scopeType: req.body.scopeType || 'project',
  projectPath: req.body.projectPath,
  workstreamId: req.body.workstreamId,
  taskId: req.body.taskId
};
const lock = concurrency.tryAcquire(`pending:${Date.now()}`, scope, req.body.isReadOnly === true);
if (!lock.success) {
  res.status(409).json({ error: lock.reason });
  return;
}
```

Use the actual run id for robust release by wrapping `runner.start` through a helper. If the current runner only returns id after start, use a generated lock id and release by the same generated lock id after the promise settles.

- [ ] **Step 5: Add `/api/locks` read-only endpoint**

```js
app.get('/api/locks', (_req, res) => {
  res.json(concurrency.getLockStatus());
});
```

- [ ] **Step 6: Add integration tests**

Test that two concurrent write requests for the same projectPath return one `202` and one `409` using a runner that resolves only after the test releases it. Test that `isReadOnly: true` bypasses locks.

- [ ] **Step 7: Run tests**

Run:

```bash
npm --prefix control-plane test -- tests/concurrencyControl.test.js tests/*run*.test.js
npm --prefix control-plane test
```

Expected: all tests pass.

---

### Task 5: P4 support scoped runner commands

**Files:**
- Modify: `control-plane/src/runner/commandBuilder.js`
- Modify: `control-plane/src/runner/claudeRunner.js`
- Modify: `control-plane/tests/commandBuilder.test.js`
- Modify: `control-plane/tests/claudeRunner.test.js`

- [ ] **Step 1: Extend `buildClaudeCommand()` with scope fields**

Add optional parameters:

```js
scopeType,
scopeId,
productId,
milestoneId,
workstreamId,
taskId,
agentRole,
projectName,
acceptanceRef,
extraPrompt
```

Return an `env` object alongside file/args/prompt:

```js
return {
  file: claudeCommand,
  args: ['-p', prompt, '--output-format', 'json'],
  prompt,
  env: buildScopeEnv({ scopeType, scopeId, productId, milestoneId, workstreamId, taskId, agentRole, projectName, acceptanceRef })
};
```

- [ ] **Step 2: Inject env into spawned process**

In `claudeRunner.js`, change spawn call to:

```js
const child = spawnFn(command.file, command.args, {
  cwd: payload.cwd || config.claudeAssetsDir,
  shell: false,
  env: { ...process.env, ...(command.env || {}) }
});
```

- [ ] **Step 3: Ensure retrieval pack injection actually reaches prompt**

Currently `app.js` sets `runPayload.prompt`, but `runner/commandBuilder.js` ignores `payload.prompt` for normal commands. Update `buildClaudeCommand()` so normal commands use provided prompt when present:

```js
const prompt = rest.prompt || buildPrompt({ claudeAssetsDir, commandType, targetName });
```

- [ ] **Step 4: Add tests for env and prompt injection**

In `commandBuilder.test.js`, assert:

```js
const command = buildClaudeCommand({
  claudeCommand: 'claude',
  claudeAssetsDir: 'H:/claude-assets',
  commandType: 'go',
  targetName: 'demo',
  scopeType: 'workstream',
  scopeId: 'ws-1',
  productId: 'p-1',
  milestoneId: 'm-1',
  workstreamId: 'ws-1',
  agentRole: 'backend',
  projectName: 'demo'
});
expect(command.env.PAPERCLIP_SCOPE_TYPE).toBe('workstream');
expect(command.env.PAPERCLIP_WORKSTREAM_ID).toBe('ws-1');
```

- [ ] **Step 5: Run runner tests and full tests**

Run:

```bash
npm --prefix control-plane test -- tests/commandBuilder.test.js tests/claudeRunner.test.js
npm --prefix control-plane test
```

Expected: all tests pass.

---

### Task 6: P5 documentation convergence

**Files:**
- Modify: `docs/README.md`
- Modify: `docs/superpowers/specs/2026-05-22-one-person-dev-company-os-design.md`
- Modify: `docs/superpowers/plans/phase-4-implementation-plan.md`
- Modify: `docs/superpowers/specs/2026-05-23-control-plane-phase4-spec.md`
- Modify: `docs/superpowers/specs/2026-05-23-phase4-memory-retrieval-spec.md`

- [ ] **Step 1: Make Phase 4 naming unambiguous**

In the main OS spec, keep Phase 4 as “大项目工作流：Product / Milestone / Workstream / Task + 分层 Gate + 并发控制”.

- [ ] **Step 2: Reclassify memory retrieval docs**

Rename or clearly mark memory retrieval documents as “Phase 3.5 / future memory enhancement”, not current Phase 4. If renaming files is too invasive, add a top note:

```md
> 范围说明：本文不是当前 Phase 4（大项目工作流）的执行范围，归档为 Phase 3.5/后续记忆增强候选方案。
```

- [ ] **Step 3: Update docs README links**

Remove links to deleted `docs/01-overview.md`, `02-blueprint.md`, `03-runbook.md`, `04-reference.md`, or replace them with current files that exist.

- [ ] **Step 4: Document completed API surface**

Add concise sections for:

```text
GET/POST/PATCH/DELETE /api/products
GET/POST/PATCH/DELETE milestones/workstreams/tasks
GET/POST /api/gates
GET /api/locks
```

- [ ] **Step 5: Run docs sanity checks**

Run:

```bash
git diff -- docs
npm --prefix control-plane test
```

Expected: no docs link points to deleted files; tests still pass.

---

### Task 7: Final verification and review

**Files:**
- All touched files.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm --prefix control-plane test
npm --prefix control-plane run test:coverage
npm --prefix control-plane run audit:prod
```

Expected: tests pass, coverage command exits 0, production audit has no high/critical runtime vulnerability requiring immediate fix.

- [ ] **Step 2: Run local app for manual UI verification**

Run:

```bash
npm --prefix control-plane start
```

Open local Web Console. Verify:

1. Dashboard loads.
2. Product tree loads.
3. Can create Product → Milestone → Workstream → Task.
4. Iteration center still lists CRs.
5. Memory center still lists events/facts/packs.
6. Agent run form still accepts `/intake`, `/go`, `/recover`.

- [ ] **Step 3: Request code review**

Use the required review workflow after implementation. Review focus:

- Schema migration compatibility.
- XSS safety in product tree rendering.
- Runner command/env injection safety.
- Lock release correctness.
- Backward compatibility for old project indexing.

- [ ] **Step 4: Fix review blockers and re-run verification**

If review returns blockers, fix them and re-run:

```bash
npm --prefix control-plane test
```

Expected: all tests pass.

---

## Self-Review

**Spec coverage:** P0 restores legacy compatibility; P1 implements Product/Milestone/Workstream/Task and layered gates; P2 implements product-tree UI; P3 implements project/workstream locking; P4 injects scoped runner env and keeps legacy commands; P5 resolves Phase 4 documentation scope; Task 7 verifies and reviews.

**Placeholder scan:** No TBD/TODO placeholders remain in the plan. Every implementation task names exact files and commands.

**Type consistency:** Runtime path consistently uses camelCase API/store objects and snake_case only at SQLite boundaries. Gate compatibility maps legacy `projectName/name` to new `scopeType/scopeId/gateName`.
