# One Person Dev Company OS Phase 0-1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first independently shippable control-plane slice: read-only indexing of existing file-system projects plus a local Web Console that can rebuild the index, display status, and enqueue Claude Code headless runs.

**Architecture:** Add a new `control-plane/` Node.js app instead of modifying the existing prototype `dashboard/`. Express serves local APIs and static UI, better-sqlite3 stores a rebuildable index, and all source-of-truth project artifacts remain in `E:\projects`, `G:\qa-reports`, `G:\logs`, and `H:\claude-assets`.

**Tech Stack:** Node.js 20, CommonJS, Express, better-sqlite3, helmet, Vitest, Supertest, vanilla HTML/CSS/JavaScript.

---

## Scope Boundary

This plan implements only Phase 0 and Phase 1 from `docs/superpowers/specs/2026-05-22-one-person-dev-company-os-design.md`:

- Phase 0: index current file-system state into SQLite without modifying project files.
- Phase 1: local Web Console, Control Plane API, and Claude Code headless runner queue.

Separate future plans must cover:

- Phase 2: Change Request lifecycle.
- Phase 3: Memory Vault.
- Phase 4: Product / Milestone / Workstream / Task workflow.
- Phase 5: Tauri / Electron packaging.

## File Structure

Create a new app under `control-plane/`.

```text
control-plane/
  package.json
  vitest.config.js
  src/
    app.js
    server.js
    config.js
    db.js
    store.js
    indexer/
      statusReader.js
      logReader.js
      lessonReader.js
      projectIndexer.js
    runner/
      commandBuilder.js
      claudeRunner.js
    public/
      index.html
      app.js
      styles.css
  tests/
    app.health.test.js
    config.test.js
    db.test.js
    statusReader.test.js
    projectIndexer.test.js
    logReader.test.js
    lessonReader.test.js
    dashboardApi.test.js
    commandBuilder.test.js
    claudeRunner.test.js
    publicFiles.test.js
```

Responsibilities:

- `src/app.js`: Express app factory, API routes, static file serving.
- `src/server.js`: process entrypoint bound to `127.0.0.1`.
- `src/config.js`: environment-driven local path and command config.
- `src/db.js`: SQLite connection and schema initialization.
- `src/store.js`: prepared-statement database writes and reads.
- `src/indexer/*`: file-system readers and indexing orchestration.
- `src/runner/*`: safe Claude Code headless command construction and process execution.
- `src/public/*`: first Web Console UI.
- `tests/*`: unit and integration tests for each boundary.

Design system for the MVP UI:

- Color palette: graphite background `#0f1419`, panel `#1c2732`, border `#2f3b47`, primary blue `#1d9bf0`, success `#00ba7c`, danger `#f9197f`, text `#e7e9ea`, muted `#8899a6`.
- Typography: native UI sans stack to match the existing `dashboard/index.html` vocabulary.
- Spacing: 4px base unit, page padding 24px, cards 20px, grid gap 20px.
- Radius: 12px cards, 8px controls, 999px pills.
- Shadow: no heavy shadows; use borders and contrast for a local operations-console feel.
- Motion: 120ms color and transform transitions; no scroll automation.

---

### Task 1: Create the Control Plane package and health API

**Files:**
- Create: `control-plane/package.json`
- Create: `control-plane/vitest.config.js`
- Create: `control-plane/src/app.js`
- Create: `control-plane/src/server.js`
- Test: `control-plane/tests/app.health.test.js`

- [ ] **Step 1: Write the failing health test**

Create `control-plane/tests/app.health.test.js`:

```js
const request = require('supertest');
const { describe, expect, it } = require('vitest');
const { createApp } = require('../src/app');

describe('health API', () => {
  it('returns service status without touching project files', async () => {
    const app = createApp({
      store: null,
      indexer: null,
      runner: null,
      config: { version: '0.1.0' }
    });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      service: 'one-person-dev-company-control-plane',
      version: '0.1.0'
    });
  });
});
```

- [ ] **Step 2: Add package metadata and test runner**

Create `control-plane/package.json`:

```json
{
  "name": "one-person-dev-company-control-plane",
  "version": "0.1.0",
  "private": true,
  "description": "Local control plane and Web Console for the web-outsource pipeline",
  "main": "src/server.js",
  "type": "commonjs",
  "scripts": {
    "dev": "node src/server.js",
    "start": "node src/server.js",
    "test": "vitest run --coverage",
    "test:watch": "vitest",
    "audit:prod": "npm audit --omit=dev"
  },
  "dependencies": {
    "better-sqlite3": "^11.5.0",
    "express": "^4.19.2",
    "helmet": "^7.1.0"
  },
  "devDependencies": {
    "@vitest/coverage-v8": "^2.1.9",
    "supertest": "^7.0.0",
    "vitest": "^2.1.9"
  },
  "engines": {
    "node": ">=20"
  }
}
```

Create `control-plane/vitest.config.js`:

```js
module.exports = {
  test: {
    environment: 'node',
    coverage: {
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80
      }
    }
  }
};
```

- [ ] **Step 3: Run the test and verify it fails**

Run:

```bash
cd control-plane && npm install && npm test -- tests/app.health.test.js
```

Expected: FAIL with a module resolution error for `../src/app`.

- [ ] **Step 4: Implement the minimal Express app**

Create `control-plane/src/app.js`:

```js
const express = require('express');
const helmet = require('helmet');
const path = require('path');

function createApp(dependencies) {
  const app = express();
  const config = dependencies.config;

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "script-src": ["'self'"],
        "style-src": ["'self'"],
        "img-src": ["'self'", 'data:']
      }
    }
  }));
  app.use(express.json({ limit: '64kb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'one-person-dev-company-control-plane',
      version: config.version
    });
  });

  app.use((req, res) => {
    res.status(404).json({ error: `not found: ${req.method} ${req.path}` });
  });

  app.use((err, _req, res, _next) => {
    const message = err instanceof Error ? err.message : 'unexpected error';
    res.status(500).json({ error: message });
  });

  return app;
}

module.exports = { createApp };
```

Create `control-plane/src/server.js`:

```js
const { createApp } = require('./app');
const { createConfig } = require('./config');
const { openDatabase } = require('./db');
const { createStore } = require('./store');
const { createProjectIndexer } = require('./indexer/projectIndexer');
const { createClaudeRunner } = require('./runner/claudeRunner');

const config = createConfig(process.env);
const db = openDatabase(config.databasePath);
const store = createStore(db);
const indexer = createProjectIndexer({ config, store });
const runner = createClaudeRunner({ config, store });
const app = createApp({ config, store, indexer, runner });

app.listen(config.port, config.host, () => {
  process.stdout.write(`Control Plane running at http://${config.host}:${config.port}\n`);
});
```

- [ ] **Step 5: Add temporary modules required by the entrypoint**

Create `control-plane/src/config.js`:

```js
function createConfig(env) {
  return {
    version: '0.1.0',
    host: env.CONTROL_PLANE_HOST || '127.0.0.1',
    port: Number(env.CONTROL_PLANE_PORT || 3100),
    databasePath: env.CONTROL_PLANE_DB || 'data/control-plane.db',
    projectsDir: env.PROJECTS_DIR || 'E:/projects',
    qaReportsDir: env.QA_REPORTS_DIR || 'G:/qa-reports',
    logsDir: env.AGENT_LOGS_DIR || 'G:/logs/agents',
    lessonsDir: env.LESSONS_DIR || 'H:/claude-assets/lessons',
    claudeAssetsDir: env.CLAUDE_ASSETS_DIR || 'H:/claude-assets',
    claudeCommand: env.CLAUDE_COMMAND || 'claude'
  };
}

module.exports = { createConfig };
```

Create `control-plane/src/db.js`:

```js
function openDatabase() {
  return null;
}

module.exports = { openDatabase };
```

Create `control-plane/src/store.js`:

```js
function createStore() {
  return null;
}

module.exports = { createStore };
```

Create `control-plane/src/indexer/projectIndexer.js`:

```js
function createProjectIndexer() {
  return null;
}

module.exports = { createProjectIndexer };
```

Create `control-plane/src/runner/claudeRunner.js`:

```js
function createClaudeRunner() {
  return null;
}

module.exports = { createClaudeRunner };
```

- [ ] **Step 6: Run the test and verify it passes**

Run:

```bash
cd control-plane && npm test -- tests/app.health.test.js
```

Expected: PASS for `returns service status without touching project files`.

- [ ] **Step 7: Commit**

Run:

```bash
git add control-plane/package.json control-plane/vitest.config.js control-plane/src control-plane/tests/app.health.test.js
git commit -m "feat: add control plane health service"
```

---

### Task 2: Add configuration normalization

**Files:**
- Modify: `control-plane/src/config.js`
- Test: `control-plane/tests/config.test.js`

- [ ] **Step 1: Write failing config tests**

Create `control-plane/tests/config.test.js`:

```js
const { describe, expect, it } = require('vitest');
const { createConfig } = require('../src/config');

describe('createConfig', () => {
  it('uses safe localhost defaults and current pipeline paths', () => {
    const config = createConfig({});

    expect(config).toMatchObject({
      version: '0.1.0',
      host: '127.0.0.1',
      port: 3100,
      projectsDir: 'E:/projects',
      qaReportsDir: 'G:/qa-reports',
      logsDir: 'G:/logs/agents',
      lessonsDir: 'H:/claude-assets/lessons',
      claudeAssetsDir: 'H:/claude-assets',
      claudeCommand: 'claude'
    });
    expect(config.databasePath.endsWith('control-plane/data/control-plane.db')).toBe(true);
  });

  it('accepts explicit local paths from environment variables', () => {
    const config = createConfig({
      CONTROL_PLANE_HOST: '127.0.0.1',
      CONTROL_PLANE_PORT: '3200',
      CONTROL_PLANE_DB: 'C:/tmp/company-os.db',
      PROJECTS_DIR: 'D:/projects',
      QA_REPORTS_DIR: 'D:/qa',
      AGENT_LOGS_DIR: 'D:/logs',
      LESSONS_DIR: 'D:/lessons',
      CLAUDE_ASSETS_DIR: 'D:/assets',
      CLAUDE_COMMAND: 'claude.cmd'
    });

    expect(config).toMatchObject({
      host: '127.0.0.1',
      port: 3200,
      databasePath: 'C:/tmp/company-os.db',
      projectsDir: 'D:/projects',
      qaReportsDir: 'D:/qa',
      logsDir: 'D:/logs',
      lessonsDir: 'D:/lessons',
      claudeAssetsDir: 'D:/assets',
      claudeCommand: 'claude.cmd'
    });
  });

  it('rejects non-localhost binding', () => {
    expect(() => createConfig({ CONTROL_PLANE_HOST: '0.0.0.0' })).toThrow('CONTROL_PLANE_HOST must be 127.0.0.1 or localhost');
  });

  it('rejects invalid port values', () => {
    expect(() => createConfig({ CONTROL_PLANE_PORT: 'abc' })).toThrow('CONTROL_PLANE_PORT must be an integer between 1 and 65535');
    expect(() => createConfig({ CONTROL_PLANE_PORT: '70000' })).toThrow('CONTROL_PLANE_PORT must be an integer between 1 and 65535');
  });
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```bash
cd control-plane && npm test -- tests/config.test.js
```

Expected: FAIL because invalid host and port are not rejected and the database path is not normalized.

- [ ] **Step 3: Replace config implementation**

Replace `control-plane/src/config.js` with:

```js
const path = require('path');

function readLocalHost(value) {
  const host = value || '127.0.0.1';
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('CONTROL_PLANE_HOST must be 127.0.0.1 or localhost');
  }
  return host;
}

function readPort(value) {
  const port = Number(value || 3100);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('CONTROL_PLANE_PORT must be an integer between 1 and 65535');
  }
  return port;
}

function defaultDatabasePath() {
  return path.join(__dirname, '..', 'data', 'control-plane.db').replace(/\\/g, '/');
}

function createConfig(env) {
  return {
    version: '0.1.0',
    host: readLocalHost(env.CONTROL_PLANE_HOST),
    port: readPort(env.CONTROL_PLANE_PORT),
    databasePath: (env.CONTROL_PLANE_DB || defaultDatabasePath()).replace(/\\/g, '/'),
    projectsDir: env.PROJECTS_DIR || 'E:/projects',
    qaReportsDir: env.QA_REPORTS_DIR || 'G:/qa-reports',
    logsDir: env.AGENT_LOGS_DIR || 'G:/logs/agents',
    lessonsDir: env.LESSONS_DIR || 'H:/claude-assets/lessons',
    claudeAssetsDir: env.CLAUDE_ASSETS_DIR || 'H:/claude-assets',
    claudeCommand: env.CLAUDE_COMMAND || 'claude'
  };
}

module.exports = { createConfig };
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
cd control-plane && npm test -- tests/config.test.js tests/app.health.test.js
```

Expected: PASS for both test files.

- [ ] **Step 5: Commit**

Run:

```bash
git add control-plane/src/config.js control-plane/tests/config.test.js
git commit -m "feat: normalize control plane config"
```

---

### Task 3: Add rebuildable SQLite schema and store

**Files:**
- Modify: `control-plane/src/db.js`
- Modify: `control-plane/src/store.js`
- Test: `control-plane/tests/db.test.js`

- [ ] **Step 1: Write failing database tests**

Create `control-plane/tests/db.test.js`:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { afterEach, beforeEach, describe, expect, it } = require('vitest');
const { openDatabase } = require('../src/db');
const { createStore } = require('../src/store');

let tmpDir;
let db;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-plane-db-'));
  db = openDatabase(path.join(tmpDir, 'control-plane.db'));
});

afterEach(() => {
  if (db) db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('SQLite store', () => {
  it('creates schema and enables WAL', () => {
    const journalMode = db.pragma('journal_mode', { simple: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(row => row.name);

    expect(journalMode.toLowerCase()).toBe('wal');
    expect(tables).toEqual([
      'agents',
      'artifacts',
      'gates',
      'projects',
      'runs',
      'sqlite_sequence'
    ]);
  });

  it('replaces indexed project data without creating duplicate rows', () => {
    const store = createStore(db);

    store.replaceProjectIndex({
      project: {
        name: 'demo',
        rootPath: 'E:/projects/demo',
        phase: 'build',
        complexity: 'small',
        reopenCount: 1,
        updatedAt: '2026-05-22T01:00:00.000Z'
      },
      agents: [
        { projectName: 'demo', name: 'backend', status: 'done', lastRun: '2026-05-22T00:00:00.000Z', blockReason: null }
      ],
      gates: [
        { projectName: 'demo', name: 'gate3', status: 'pass', evidencePath: 'E:/projects/demo/doc/acceptance-matrix.md' }
      ],
      artifacts: [
        { projectName: 'demo', type: 'status', path: 'E:/projects/demo/.status.json', hash: 'abc', mtimeMs: 1, summary: 'phase=build' }
      ]
    });

    store.replaceProjectIndex({
      project: {
        name: 'demo',
        rootPath: 'E:/projects/demo',
        phase: 'ship',
        complexity: 'small',
        reopenCount: 2,
        updatedAt: '2026-05-22T02:00:00.000Z'
      },
      agents: [],
      gates: [],
      artifacts: []
    });

    expect(store.listProjects()).toEqual([
      {
        name: 'demo',
        rootPath: 'E:/projects/demo',
        phase: 'ship',
        complexity: 'small',
        reopenCount: 2,
        updatedAt: '2026-05-22T02:00:00.000Z'
      }
    ]);
    expect(db.prepare('SELECT COUNT(*) AS count FROM agents').get().count).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS count FROM gates').get().count).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS count FROM artifacts').get().count).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```bash
cd control-plane && npm test -- tests/db.test.js
```

Expected: FAIL because the current database module returns `null`.

- [ ] **Step 3: Implement database initialization**

Replace `control-plane/src/db.js` with:

```js
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function openDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      name TEXT PRIMARY KEY,
      root_path TEXT NOT NULL,
      phase TEXT NOT NULL,
      complexity TEXT,
      reopen_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      last_run TEXT,
      block_reason TEXT,
      FOREIGN KEY (project_name) REFERENCES projects(name) ON DELETE CASCADE,
      UNIQUE(project_name, name)
    );

    CREATE TABLE IF NOT EXISTS gates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      evidence_path TEXT,
      checked_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_name) REFERENCES projects(name) ON DELETE CASCADE,
      UNIQUE(project_name, name)
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      type TEXT NOT NULL,
      path TEXT NOT NULL,
      hash TEXT NOT NULL,
      mtime_ms INTEGER NOT NULL,
      summary TEXT NOT NULL,
      indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_name) REFERENCES projects(name) ON DELETE CASCADE,
      UNIQUE(project_name, path)
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      command_type TEXT NOT NULL,
      target_name TEXT NOT NULL,
      status TEXT NOT NULL,
      prompt TEXT NOT NULL,
      log_path TEXT NOT NULL,
      exit_code INTEGER,
      error_message TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );
  `);
  return db;
}

module.exports = { openDatabase };
```

- [ ] **Step 4: Implement prepared-statement store**

Replace `control-plane/src/store.js` with:

```js
function createStore(db) {
  const upsertProject = db.prepare(`
    INSERT INTO projects (name, root_path, phase, complexity, reopen_count, updated_at)
    VALUES (@name, @rootPath, @phase, @complexity, @reopenCount, @updatedAt)
    ON CONFLICT(name) DO UPDATE SET
      root_path = excluded.root_path,
      phase = excluded.phase,
      complexity = excluded.complexity,
      reopen_count = excluded.reopen_count,
      updated_at = excluded.updated_at
  `);
  const deleteAgents = db.prepare('DELETE FROM agents WHERE project_name = ?');
  const deleteGates = db.prepare('DELETE FROM gates WHERE project_name = ?');
  const deleteArtifacts = db.prepare('DELETE FROM artifacts WHERE project_name = ?');
  const insertAgent = db.prepare(`
    INSERT INTO agents (project_name, name, status, last_run, block_reason)
    VALUES (@projectName, @name, @status, @lastRun, @blockReason)
  `);
  const insertGate = db.prepare(`
    INSERT INTO gates (project_name, name, status, evidence_path)
    VALUES (@projectName, @name, @status, @evidencePath)
  `);
  const insertArtifact = db.prepare(`
    INSERT INTO artifacts (project_name, type, path, hash, mtime_ms, summary)
    VALUES (@projectName, @type, @path, @hash, @mtimeMs, @summary)
  `);

  const replaceProjectIndexTxn = db.transaction(payload => {
    upsertProject.run(payload.project);
    deleteAgents.run(payload.project.name);
    deleteGates.run(payload.project.name);
    deleteArtifacts.run(payload.project.name);
    payload.agents.forEach(agent => insertAgent.run(agent));
    payload.gates.forEach(gate => insertGate.run(gate));
    payload.artifacts.forEach(artifact => insertArtifact.run(artifact));
  });

  const insertRun = db.prepare(`
    INSERT INTO runs (id, command_type, target_name, status, prompt, log_path, started_at)
    VALUES (@id, @commandType, @targetName, @status, @prompt, @logPath, @startedAt)
  `);
  const finishRun = db.prepare(`
    UPDATE runs
    SET status = @status, exit_code = @exitCode, error_message = @errorMessage, finished_at = @finishedAt
    WHERE id = @id
  `);

  return {
    replaceProjectIndex: payload => replaceProjectIndexTxn(payload),
    listProjects: () => db.prepare(`
      SELECT name, root_path AS rootPath, phase, complexity, reopen_count AS reopenCount, updated_at AS updatedAt
      FROM projects
      ORDER BY updated_at DESC, name ASC
    `).all(),
    getProject: name => db.prepare(`
      SELECT name, root_path AS rootPath, phase, complexity, reopen_count AS reopenCount, updated_at AS updatedAt
      FROM projects
      WHERE name = ?
    `).get(name) || null,
    listAgents: projectName => db.prepare(`
      SELECT project_name AS projectName, name, status, last_run AS lastRun, block_reason AS blockReason
      FROM agents
      WHERE project_name = ?
      ORDER BY name ASC
    `).all(projectName),
    listGates: projectName => db.prepare(`
      SELECT project_name AS projectName, name, status, evidence_path AS evidencePath, checked_at AS checkedAt
      FROM gates
      WHERE project_name = ?
      ORDER BY name ASC
    `).all(projectName),
    listArtifacts: projectName => db.prepare(`
      SELECT project_name AS projectName, type, path, hash, mtime_ms AS mtimeMs, summary, indexed_at AS indexedAt
      FROM artifacts
      WHERE project_name = ?
      ORDER BY type ASC, path ASC
    `).all(projectName),
    createRun: run => insertRun.run(run),
    finishRun: run => finishRun.run(run),
    listRuns: () => db.prepare(`
      SELECT id, command_type AS commandType, target_name AS targetName, status, prompt, log_path AS logPath,
             exit_code AS exitCode, error_message AS errorMessage, started_at AS startedAt, finished_at AS finishedAt
      FROM runs
      ORDER BY started_at DESC
      LIMIT 50
    `).all()
  };
}

module.exports = { createStore };
```

- [ ] **Step 5: Run tests and verify pass**

Run:

```bash
cd control-plane && npm test -- tests/db.test.js tests/config.test.js tests/app.health.test.js
```

Expected: PASS for all three test files.

- [ ] **Step 6: Commit**

Run:

```bash
git add control-plane/src/db.js control-plane/src/store.js control-plane/tests/db.test.js
git commit -m "feat: add control plane sqlite index"
```

---

### Task 4: Read project status files and index project artifacts

**Files:**
- Create: `control-plane/src/indexer/statusReader.js`
- Modify: `control-plane/src/indexer/projectIndexer.js`
- Test: `control-plane/tests/statusReader.test.js`
- Test: `control-plane/tests/projectIndexer.test.js`

- [ ] **Step 1: Write failing status reader tests**

Create `control-plane/tests/statusReader.test.js`:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { afterEach, beforeEach, describe, expect, it } = require('vitest');
const { readProjectStatusFiles } = require('../src/indexer/statusReader');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'status-reader-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('readProjectStatusFiles', () => {
  it('returns parsed project status records and file metadata', () => {
    fs.mkdirSync(path.join(tmpDir, 'demo'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'demo', '.status.json'), JSON.stringify({
      project: 'demo',
      phase: 'build',
      complexity: 'small',
      reopenCount: 1,
      agents: {
        backend: { status: 'done', lastRun: '2026-05-22T00:00:00.000Z' },
        reviewer: { status: 'blocked', blockReason: 'codex-unavailable' }
      },
      gates: { gate1: 'pass', gate2: 'pending' },
      updatedAt: '2026-05-22T01:00:00.000Z'
    }, null, 2));

    const result = readProjectStatusFiles(tmpDir);

    expect(result.errors).toEqual([]);
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]).toMatchObject({
      project: {
        name: 'demo',
        rootPath: path.join(tmpDir, 'demo').replace(/\\/g, '/'),
        phase: 'build',
        complexity: 'small',
        reopenCount: 1,
        updatedAt: '2026-05-22T01:00:00.000Z'
      },
      agents: [
        { projectName: 'demo', name: 'backend', status: 'done', lastRun: '2026-05-22T00:00:00.000Z', blockReason: null },
        { projectName: 'demo', name: 'reviewer', status: 'blocked', lastRun: null, blockReason: 'codex-unavailable' }
      ],
      gates: [
        { projectName: 'demo', name: 'gate1', status: 'pass', evidencePath: null },
        { projectName: 'demo', name: 'gate2', status: 'pending', evidencePath: null }
      ]
    });
    expect(result.projects[0].artifacts[0]).toMatchObject({
      projectName: 'demo',
      type: 'status',
      path: path.join(tmpDir, 'demo', '.status.json').replace(/\\/g, '/'),
      summary: 'phase=build gates=2 agents=2'
    });
    expect(result.projects[0].artifacts[0].hash).toHaveLength(64);
  });

  it('reports invalid status JSON without throwing', () => {
    fs.mkdirSync(path.join(tmpDir, 'bad'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'bad', '.status.json'), '{');

    const result = readProjectStatusFiles(tmpDir);

    expect(result.projects).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].path.endsWith('/bad/.status.json')).toBe(true);
    expect(result.errors[0].message).toContain('Expected property name');
  });

  it('returns an error when projects directory is missing', () => {
    const result = readProjectStatusFiles(path.join(tmpDir, 'missing'));

    expect(result.projects).toEqual([]);
    expect(result.errors).toEqual([
      {
        path: path.join(tmpDir, 'missing').replace(/\\/g, '/'),
        message: 'projects directory does not exist'
      }
    ]);
  });
});
```

- [ ] **Step 2: Write failing indexer tests**

Create `control-plane/tests/projectIndexer.test.js`:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { afterEach, beforeEach, describe, expect, it } = require('vitest');
const { createProjectIndexer } = require('../src/indexer/projectIndexer');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-indexer-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('createProjectIndexer', () => {
  it('rebuilds the store from file-system status files', () => {
    fs.mkdirSync(path.join(tmpDir, 'demo'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'demo', '.status.json'), JSON.stringify({
      project: 'demo',
      phase: 'design',
      complexity: 'medium',
      reopenCount: 0,
      agents: { architect: { status: 'done' } },
      gates: { gate2: 'pass' },
      updatedAt: '2026-05-22T03:00:00.000Z'
    }));

    const saved = [];
    const indexer = createProjectIndexer({
      config: { projectsDir: tmpDir },
      store: { replaceProjectIndex: payload => saved.push(payload) }
    });

    const result = indexer.rebuild();

    expect(result).toEqual({ indexedProjects: 1, errors: [] });
    expect(saved).toHaveLength(1);
    expect(saved[0].project.name).toBe('demo');
    expect(saved[0].gates[0]).toEqual({ projectName: 'demo', name: 'gate2', status: 'pass', evidencePath: null });
  });
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
cd control-plane && npm test -- tests/statusReader.test.js tests/projectIndexer.test.js
```

Expected: FAIL because `statusReader.js` does not exist and `projectIndexer.js` returns `null`.

- [ ] **Step 4: Implement status reader**

Create `control-plane/src/indexer/statusReader.js`:

```js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function toAgentRows(projectName, agents) {
  return Object.entries(agents || {}).map(([name, info]) => ({
    projectName,
    name,
    status: String(info.status || 'pending'),
    lastRun: info.lastRun || null,
    blockReason: info.blockReason || null
  }));
}

function toGateRows(projectName, gates) {
  return Object.entries(gates || {}).map(([name, status]) => ({
    projectName,
    name,
    status: String(status || 'pending'),
    evidencePath: null
  }));
}

function parseStatusFile(statusPath, projectRoot) {
  const content = fs.readFileSync(statusPath, 'utf8');
  const status = JSON.parse(content);
  const stat = fs.statSync(statusPath);
  const projectName = String(status.project || path.basename(projectRoot));
  const agents = toAgentRows(projectName, status.agents);
  const gates = toGateRows(projectName, status.gates);

  return {
    project: {
      name: projectName,
      rootPath: normalizePath(projectRoot),
      phase: String(status.phase || 'unknown'),
      complexity: status.complexity || 'unknown',
      reopenCount: Number(status.reopenCount || 0),
      updatedAt: status.updatedAt || new Date(stat.mtimeMs).toISOString()
    },
    agents,
    gates,
    artifacts: [
      {
        projectName,
        type: 'status',
        path: normalizePath(statusPath),
        hash: hashContent(content),
        mtimeMs: Math.trunc(stat.mtimeMs),
        summary: `phase=${String(status.phase || 'unknown')} gates=${gates.length} agents=${agents.length}`
      }
    ]
  };
}

function readProjectStatusFiles(projectsDir) {
  const normalizedProjectsDir = normalizePath(projectsDir);
  if (!fs.existsSync(projectsDir)) {
    return {
      projects: [],
      errors: [{ path: normalizedProjectsDir, message: 'projects directory does not exist' }]
    };
  }

  const projects = [];
  const errors = [];
  const entries = fs.readdirSync(projectsDir, { withFileTypes: true });

  entries.filter(entry => entry.isDirectory()).forEach(entry => {
    const projectRoot = path.join(projectsDir, entry.name);
    const statusPath = path.join(projectRoot, '.status.json');
    if (!fs.existsSync(statusPath)) return;

    try {
      projects.push(parseStatusFile(statusPath, projectRoot));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed to parse status file';
      errors.push({ path: normalizePath(statusPath), message });
    }
  });

  return { projects, errors };
}

module.exports = { readProjectStatusFiles };
```

- [ ] **Step 5: Implement project indexer**

Replace `control-plane/src/indexer/projectIndexer.js` with:

```js
const { readProjectStatusFiles } = require('./statusReader');

function createProjectIndexer({ config, store }) {
  return {
    rebuild: () => {
      const result = readProjectStatusFiles(config.projectsDir);
      result.projects.forEach(projectIndex => store.replaceProjectIndex(projectIndex));
      return {
        indexedProjects: result.projects.length,
        errors: result.errors
      };
    }
  };
}

module.exports = { createProjectIndexer };
```

- [ ] **Step 6: Run tests and verify pass**

Run:

```bash
cd control-plane && npm test -- tests/statusReader.test.js tests/projectIndexer.test.js tests/db.test.js
```

Expected: PASS for all three test files.

- [ ] **Step 7: Commit**

Run:

```bash
git add control-plane/src/indexer/statusReader.js control-plane/src/indexer/projectIndexer.js control-plane/tests/statusReader.test.js control-plane/tests/projectIndexer.test.js
git commit -m "feat: index project status files"
```

---

### Task 5: Add log and lessons readers for dashboard summaries

**Files:**
- Create: `control-plane/src/indexer/logReader.js`
- Create: `control-plane/src/indexer/lessonReader.js`
- Test: `control-plane/tests/logReader.test.js`
- Test: `control-plane/tests/lessonReader.test.js`

- [ ] **Step 1: Write failing log reader tests**

Create `control-plane/tests/logReader.test.js`:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { afterEach, beforeEach, describe, expect, it } = require('vitest');
const { readRecentLogs } = require('../src/indexer/logReader');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-reader-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('readRecentLogs', () => {
  it('returns newest log lines with level classification', () => {
    fs.writeFileSync(path.join(tmpDir, 'demo-backend-20260522-100000.log'), 'started\nERROR failed\n');
    fs.writeFileSync(path.join(tmpDir, 'demo-qa-20260522-110000.log'), 'PASS coverage\n');

    const logs = readRecentLogs(tmpDir, 3);

    expect(logs).toEqual([
      {
        file: 'demo-qa-20260522-110000.log',
        agent: 'qa',
        message: 'PASS coverage',
        level: 'info'
      },
      {
        file: 'demo-backend-20260522-100000.log',
        agent: 'backend',
        message: 'ERROR failed',
        level: 'error'
      },
      {
        file: 'demo-backend-20260522-100000.log',
        agent: 'backend',
        message: 'started',
        level: 'info'
      }
    ]);
  });

  it('returns a readable error for a missing logs directory', () => {
    const logs = readRecentLogs(path.join(tmpDir, 'missing'), 5);

    expect(logs).toEqual([]);
  });
});
```

- [ ] **Step 2: Write failing lessons reader tests**

Create `control-plane/tests/lessonReader.test.js`:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { afterEach, beforeEach, describe, expect, it } = require('vitest');
const { countLessonFiles } = require('../src/indexer/lessonReader');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-reader-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('countLessonFiles', () => {
  it('counts markdown lesson files except the index', () => {
    fs.writeFileSync(path.join(tmpDir, 'INDEX.md'), '# index');
    fs.writeFileSync(path.join(tmpDir, 'backend.md'), '# backend');
    fs.writeFileSync(path.join(tmpDir, 'qa.md'), '# qa');
    fs.writeFileSync(path.join(tmpDir, 'raw.txt'), 'ignored');

    expect(countLessonFiles(tmpDir)).toBe(2);
  });

  it('returns zero when lessons directory is missing', () => {
    expect(countLessonFiles(path.join(tmpDir, 'missing'))).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
cd control-plane && npm test -- tests/logReader.test.js tests/lessonReader.test.js
```

Expected: FAIL because both modules do not exist.

- [ ] **Step 4: Implement log reader**

Create `control-plane/src/indexer/logReader.js`:

```js
const fs = require('fs');
const path = require('path');

function detectAgent(file) {
  const parts = file.replace(/\.log$/, '').split('-');
  return parts.length >= 3 ? parts[parts.length - 3] : 'unknown';
}

function classifyLine(line) {
  return line.toLowerCase().includes('error') || line.toLowerCase().includes('fail') ? 'error' : 'info';
}

function readRecentLogs(logsDir, limit) {
  if (!fs.existsSync(logsDir)) return [];

  return fs.readdirSync(logsDir)
    .filter(file => file.endsWith('.log'))
    .sort()
    .reverse()
    .flatMap(file => {
      const content = fs.readFileSync(path.join(logsDir, file), 'utf8');
      return content.split('\n')
        .filter(Boolean)
        .slice(-3)
        .reverse()
        .map(line => ({
          file,
          agent: detectAgent(file),
          message: line.slice(0, 160),
          level: classifyLine(line)
        }));
    })
    .slice(0, limit);
}

module.exports = { readRecentLogs };
```

- [ ] **Step 5: Implement lessons reader**

Create `control-plane/src/indexer/lessonReader.js`:

```js
const fs = require('fs');

function countLessonFiles(lessonsDir) {
  if (!fs.existsSync(lessonsDir)) return 0;

  return fs.readdirSync(lessonsDir)
    .filter(file => file.endsWith('.md') && file !== 'INDEX.md')
    .length;
}

module.exports = { countLessonFiles };
```

- [ ] **Step 6: Run tests and verify pass**

Run:

```bash
cd control-plane && npm test -- tests/logReader.test.js tests/lessonReader.test.js
```

Expected: PASS for both test files.

- [ ] **Step 7: Commit**

Run:

```bash
git add control-plane/src/indexer/logReader.js control-plane/src/indexer/lessonReader.js control-plane/tests/logReader.test.js control-plane/tests/lessonReader.test.js
git commit -m "feat: read dashboard log summaries"
```

---

### Task 6: Expose indexing and dashboard APIs

**Files:**
- Modify: `control-plane/src/app.js`
- Test: `control-plane/tests/dashboardApi.test.js`

- [ ] **Step 1: Write failing API integration tests**

Create `control-plane/tests/dashboardApi.test.js`:

```js
const request = require('supertest');
const { describe, expect, it } = require('vitest');
const { createApp } = require('../src/app');

function createTestStore() {
  return {
    listProjects: () => [
      { name: 'demo', rootPath: 'E:/projects/demo', phase: 'build', complexity: 'small', reopenCount: 0, updatedAt: '2026-05-22T01:00:00.000Z' },
      { name: 'blocked', rootPath: 'E:/projects/blocked', phase: 'build', complexity: 'medium', reopenCount: 3, updatedAt: '2026-05-22T02:00:00.000Z' }
    ],
    getProject: name => name === 'demo'
      ? { name: 'demo', rootPath: 'E:/projects/demo', phase: 'build', complexity: 'small', reopenCount: 0, updatedAt: '2026-05-22T01:00:00.000Z' }
      : null,
    listAgents: name => name === 'blocked'
      ? [{ projectName: 'blocked', name: 'reviewer', status: 'blocked', lastRun: null, blockReason: 'codex-unavailable' }]
      : [{ projectName: 'demo', name: 'backend', status: 'in_progress', lastRun: null, blockReason: null }],
    listGates: name => name === 'blocked'
      ? [{ projectName: 'blocked', name: 'gate4', status: 'fail', evidencePath: 'G:/qa-reports/blocked/review.md', checkedAt: '2026-05-22 02:00:00' }]
      : [{ projectName: 'demo', name: 'gate3', status: 'pass', evidencePath: null, checkedAt: '2026-05-22 01:00:00' }],
    listArtifacts: () => [{ projectName: 'demo', type: 'status', path: 'E:/projects/demo/.status.json', hash: 'abc', mtimeMs: 1, summary: 'phase=build', indexedAt: '2026-05-22 01:00:00' }],
    listRuns: () => []
  };
}

describe('dashboard APIs', () => {
  it('rebuilds the index through the indexer', async () => {
    const app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing' },
      store: createTestStore(),
      indexer: { rebuild: () => ({ indexedProjects: 2, errors: [] }) },
      runner: null
    });

    const response = await request(app).post('/api/index/rebuild');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ indexedProjects: 2, errors: [] });
  });

  it('returns dashboard metrics with blockers and failing gates', async () => {
    const app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing' },
      store: createTestStore(),
      indexer: { rebuild: () => ({ indexedProjects: 2, errors: [] }) },
      runner: null
    });

    const response = await request(app).get('/api/dashboard');

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({ totalProjects: 2, activeAgents: 1, blockedProjects: 1, lessonsCount: 0 });
    expect(response.body.blockers).toEqual([
      { projectName: 'blocked', agent: 'reviewer', reason: 'codex-unavailable' }
    ]);
    expect(response.body.failingGates).toEqual([
      { projectName: 'blocked', gate: 'gate4', status: 'fail', evidencePath: 'G:/qa-reports/blocked/review.md' }
    ]);
  });

  it('returns project details with agents, gates, and artifacts', async () => {
    const app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing' },
      store: createTestStore(),
      indexer: { rebuild: () => ({ indexedProjects: 2, errors: [] }) },
      runner: null
    });

    const response = await request(app).get('/api/projects/demo');

    expect(response.status).toBe(200);
    expect(response.body.project.name).toBe('demo');
    expect(response.body.agents).toHaveLength(1);
    expect(response.body.gates).toHaveLength(1);
    expect(response.body.artifacts).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```bash
cd control-plane && npm test -- tests/dashboardApi.test.js
```

Expected: FAIL with 404 responses for the new endpoints.

- [ ] **Step 3: Replace app implementation with dashboard APIs**

Replace `control-plane/src/app.js` with:

```js
const express = require('express');
const helmet = require('helmet');
const path = require('path');
const { readRecentLogs } = require('./indexer/logReader');
const { countLessonFiles } = require('./indexer/lessonReader');

function collectDashboard(store, config) {
  const projects = store.listProjects();
  const projectDetails = projects.map(project => ({
    project,
    agents: store.listAgents(project.name),
    gates: store.listGates(project.name)
  }));
  const activeAgents = projectDetails.flatMap(item => item.agents).filter(agent => agent.status === 'in_progress').length;
  const blockers = projectDetails.flatMap(item => item.agents
    .filter(agent => agent.status === 'blocked')
    .map(agent => ({ projectName: item.project.name, agent: agent.name, reason: agent.blockReason || 'blocked' }))
  );
  const failingGates = projectDetails.flatMap(item => item.gates
    .filter(gate => gate.status === 'fail' || gate.status === 'warning')
    .map(gate => ({ projectName: item.project.name, gate: gate.name, status: gate.status, evidencePath: gate.evidencePath }))
  );

  return {
    summary: {
      totalProjects: projects.length,
      activeAgents,
      blockedProjects: new Set(blockers.map(blocker => blocker.projectName)).size,
      lessonsCount: countLessonFiles(config.lessonsDir)
    },
    projects,
    blockers,
    failingGates,
    recentLogs: readRecentLogs(config.logsDir, 20),
    runs: store.listRuns(),
    timestamp: new Date().toISOString()
  };
}

function createApp(dependencies) {
  const app = express();
  const { config, store, indexer, runner } = dependencies;

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "script-src": ["'self'"],
        "style-src": ["'self'"],
        "img-src": ["'self'", 'data:']
      }
    }
  }));
  app.use(express.json({ limit: '64kb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'one-person-dev-company-control-plane', version: config.version });
  });

  app.post('/api/index/rebuild', (_req, res, next) => {
    try {
      res.json(indexer.rebuild());
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/dashboard', (_req, res, next) => {
    try {
      res.json(collectDashboard(store, config));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects', (_req, res, next) => {
    try {
      res.json({ projects: store.listProjects() });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:name', (req, res, next) => {
    try {
      const project = store.getProject(req.params.name);
      if (!project) {
        res.status(404).json({ error: 'project not found' });
        return;
      }
      res.json({
        project,
        agents: store.listAgents(project.name),
        gates: store.listGates(project.name),
        artifacts: store.listArtifacts(project.name)
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/runs', (_req, res, next) => {
    try {
      res.json({ runs: store.listRuns() });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/runs', async (req, res, next) => {
    try {
      if (!runner) {
        res.status(503).json({ error: 'runner unavailable' });
        return;
      }
      const run = await runner.start(req.body);
      res.status(202).json(run);
    } catch (error) {
      next(error);
    }
  });

  app.use((req, res) => {
    res.status(404).json({ error: `not found: ${req.method} ${req.path}` });
  });

  app.use((err, _req, res, _next) => {
    const message = err instanceof Error ? err.message : 'unexpected error';
    res.status(500).json({ error: message });
  });

  return app;
}

module.exports = { createApp, collectDashboard };
```

- [ ] **Step 4: Run API tests and existing tests**

Run:

```bash
cd control-plane && npm test -- tests/dashboardApi.test.js tests/app.health.test.js tests/logReader.test.js tests/lessonReader.test.js
```

Expected: PASS for all four test files.

- [ ] **Step 5: Commit**

Run:

```bash
git add control-plane/src/app.js control-plane/tests/dashboardApi.test.js
git commit -m "feat: expose control plane dashboard api"
```

---

### Task 7: Add safe Claude Code headless runner queue

**Files:**
- Create: `control-plane/src/runner/commandBuilder.js`
- Modify: `control-plane/src/runner/claudeRunner.js`
- Test: `control-plane/tests/commandBuilder.test.js`
- Test: `control-plane/tests/claudeRunner.test.js`

- [ ] **Step 1: Write failing command builder tests**

Create `control-plane/tests/commandBuilder.test.js`:

```js
const { describe, expect, it } = require('vitest');
const { buildClaudeCommand } = require('../src/runner/commandBuilder');

describe('buildClaudeCommand', () => {
  it('builds a headless go command with JSON output', () => {
    const command = buildClaudeCommand({
      claudeCommand: 'claude',
      claudeAssetsDir: 'H:/claude-assets',
      commandType: 'go',
      targetName: 'demo-client'
    });

    expect(command).toEqual({
      file: 'claude',
      args: [
        '-p',
        '在 H:/claude-assets 中执行 /go demo-client。遵守项目 CLAUDE.md、governance 规则和 Codex 双审要求。',
        '--output-format',
        'json'
      ],
      prompt: '在 H:/claude-assets 中执行 /go demo-client。遵守项目 CLAUDE.md、governance 规则和 Codex 双审要求。'
    });
  });

  it('allows only intake, go, and recover command types', () => {
    expect(() => buildClaudeCommand({ claudeCommand: 'claude', claudeAssetsDir: 'H:/claude-assets', commandType: 'delete', targetName: 'demo' }))
      .toThrow('commandType must be intake, go, or recover');
  });

  it('rejects unsafe target names', () => {
    expect(() => buildClaudeCommand({ claudeCommand: 'claude', claudeAssetsDir: 'H:/claude-assets', commandType: 'go', targetName: '../demo' }))
      .toThrow('targetName must contain only letters, numbers, underscore, dash, and CJK characters');
  });
});
```

- [ ] **Step 2: Write failing runner tests**

Create `control-plane/tests/claudeRunner.test.js`:

```js
const EventEmitter = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { afterEach, beforeEach, describe, expect, it } = require('vitest');
const { createClaudeRunner } = require('../src/runner/claudeRunner');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-runner-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function createProcess(exitCode) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  process.nextTick(() => {
    child.stdout.emit('data', Buffer.from('{"type":"result","subtype":"success"}\n'));
    child.stderr.emit('data', Buffer.from(''));
    child.emit('close', exitCode);
  });
  return child;
}

describe('createClaudeRunner', () => {
  it('creates a run, writes logs, and marks success', async () => {
    const createdRuns = [];
    const finishedRuns = [];
    const runner = createClaudeRunner({
      config: {
        claudeCommand: 'claude',
        claudeAssetsDir: 'H:/claude-assets',
        logsDir: tmpDir
      },
      store: {
        createRun: run => createdRuns.push(run),
        finishRun: run => finishedRuns.push(run)
      },
      spawnFn: (_file, _args) => createProcess(0),
      idFn: () => 'run-1',
      nowFn: () => '2026-05-22T04:00:00.000Z'
    });

    const run = await runner.start({ commandType: 'go', targetName: 'demo' });

    expect(run).toMatchObject({ id: 'run-1', commandType: 'go', targetName: 'demo', status: 'completed' });
    expect(createdRuns[0]).toMatchObject({ id: 'run-1', status: 'running' });
    expect(finishedRuns[0]).toMatchObject({ id: 'run-1', status: 'completed', exitCode: 0, errorMessage: null });
    expect(fs.readFileSync(path.join(tmpDir, 'run-1.log'), 'utf8')).toContain('success');
  });

  it('marks failed runs with stderr content', async () => {
    const finishedRuns = [];
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    process.nextTick(() => {
      child.stderr.emit('data', Buffer.from('permission denied'));
      child.emit('close', 1);
    });

    const runner = createClaudeRunner({
      config: { claudeCommand: 'claude', claudeAssetsDir: 'H:/claude-assets', logsDir: tmpDir },
      store: { createRun: () => {}, finishRun: run => finishedRuns.push(run) },
      spawnFn: () => child,
      idFn: () => 'run-2',
      nowFn: () => '2026-05-22T04:00:00.000Z'
    });

    const run = await runner.start({ commandType: 'go', targetName: 'demo' });

    expect(run.status).toBe('failed');
    expect(finishedRuns[0]).toMatchObject({ status: 'failed', exitCode: 1, errorMessage: 'permission denied' });
  });
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
cd control-plane && npm test -- tests/commandBuilder.test.js tests/claudeRunner.test.js
```

Expected: FAIL because `commandBuilder.js` does not exist and `claudeRunner.js` returns `null`.

- [ ] **Step 4: Implement command builder**

Create `control-plane/src/runner/commandBuilder.js`:

```js
const COMMANDS = new Set(['intake', 'go', 'recover']);
const SAFE_TARGET = /^[\p{L}\p{N}_-]+$/u;

function buildPrompt({ claudeAssetsDir, commandType, targetName }) {
  return `在 ${claudeAssetsDir} 中执行 /${commandType} ${targetName}。遵守项目 CLAUDE.md、governance 规则和 Codex 双审要求。`;
}

function buildClaudeCommand({ claudeCommand, claudeAssetsDir, commandType, targetName }) {
  if (!COMMANDS.has(commandType)) {
    throw new Error('commandType must be intake, go, or recover');
  }
  if (!SAFE_TARGET.test(targetName)) {
    throw new Error('targetName must contain only letters, numbers, underscore, dash, and CJK characters');
  }

  const prompt = buildPrompt({ claudeAssetsDir, commandType, targetName });
  return {
    file: claudeCommand,
    args: ['-p', prompt, '--output-format', 'json'],
    prompt
  };
}

module.exports = { buildClaudeCommand };
```

- [ ] **Step 5: Implement runner**

Replace `control-plane/src/runner/claudeRunner.js` with:

```js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { buildClaudeCommand } = require('./commandBuilder');

function createClaudeRunner({ config, store, spawnFn = spawn, idFn = crypto.randomUUID, nowFn = () => new Date().toISOString() }) {
  return {
    start: payload => new Promise(resolve => {
      const command = buildClaudeCommand({
        claudeCommand: config.claudeCommand,
        claudeAssetsDir: config.claudeAssetsDir,
        commandType: payload.commandType,
        targetName: payload.targetName
      });
      const id = idFn();
      const startedAt = nowFn();
      const logPath = path.join(config.logsDir, `${id}.log`).replace(/\\/g, '/');
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      store.createRun({
        id,
        commandType: payload.commandType,
        targetName: payload.targetName,
        status: 'running',
        prompt: command.prompt,
        logPath,
        startedAt
      });

      const child = spawnFn(command.file, command.args, { cwd: config.claudeAssetsDir, shell: false });
      const chunks = [];
      const errors = [];

      child.stdout.on('data', data => {
        chunks.push(data);
        fs.appendFileSync(logPath, data);
      });
      child.stderr.on('data', data => {
        errors.push(data);
        fs.appendFileSync(logPath, data);
      });
      child.on('close', exitCode => {
        const stderr = Buffer.concat(errors).toString('utf8').trim();
        const status = exitCode === 0 ? 'completed' : 'failed';
        const finishedAt = nowFn();
        const finishedRun = {
          id,
          status,
          exitCode,
          errorMessage: stderr || null,
          finishedAt
        };
        store.finishRun(finishedRun);
        resolve({
          id,
          commandType: payload.commandType,
          targetName: payload.targetName,
          status,
          logPath,
          exitCode,
          errorMessage: stderr || null,
          startedAt,
          finishedAt
        });
      });
    })
  };
}

module.exports = { createClaudeRunner };
```

- [ ] **Step 6: Run runner tests and API tests**

Run:

```bash
cd control-plane && npm test -- tests/commandBuilder.test.js tests/claudeRunner.test.js tests/dashboardApi.test.js
```

Expected: PASS for all three test files.

- [ ] **Step 7: Commit**

Run:

```bash
git add control-plane/src/runner control-plane/tests/commandBuilder.test.js control-plane/tests/claudeRunner.test.js
git commit -m "feat: add claude headless runner"
```

---

### Task 8: Build the local Web Console UI

**Files:**
- Create: `control-plane/src/public/index.html`
- Create: `control-plane/src/public/styles.css`
- Create: `control-plane/src/public/app.js`
- Test: `control-plane/tests/publicFiles.test.js`

- [ ] **Step 1: Write failing static UI tests**

Create `control-plane/tests/publicFiles.test.js`:

```js
const fs = require('fs');
const path = require('path');
const { describe, expect, it } = require('vitest');

describe('public Web Console files', () => {
  it('ships the dashboard shell and avoids iframe-hostile scroll automation', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'index.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'styles.css'), 'utf8');

    expect(html).toContain('<main class="layout">');
    expect(html).toContain('id="rebuild-index"');
    expect(js).toContain('fetchJson');
    expect(js).not.toContain('scrollIntoView');
    expect(css).toContain('--color-primary: #1d9bf0');
    expect(css).toContain('text-wrap: pretty');
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
cd control-plane && npm test -- tests/publicFiles.test.js
```

Expected: FAIL because public files do not exist.

- [ ] **Step 3: Create HTML shell**

Create `control-plane/src/public/index.html`:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>One Person Dev Company OS</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <main class="layout">
    <header class="hero">
      <div>
        <p class="eyebrow">Local Control Plane</p>
        <h1>一人开发公司 OS</h1>
        <p class="subtitle">文件系统是真相源，SQLite 是可重建索引，Claude Code 是执行引擎。</p>
      </div>
      <div class="actions">
        <button id="rebuild-index" class="button primary">重建索引</button>
        <button id="refresh-dashboard" class="button">刷新</button>
      </div>
    </header>

    <section class="stats-grid" aria-label="系统指标">
      <article class="stat-card"><span id="total-projects">-</span><small>项目</small></article>
      <article class="stat-card"><span id="active-agents">-</span><small>运行中 Agent</small></article>
      <article class="stat-card"><span id="blocked-projects">-</span><small>阻塞项目</small></article>
      <article class="stat-card"><span id="lessons-count">-</span><small>经验条目</small></article>
    </section>

    <section class="panel">
      <div class="panel-heading">
        <h2>项目</h2>
        <p id="status-message">等待加载</p>
      </div>
      <div id="projects-list" class="project-list"></div>
    </section>

    <section class="two-column">
      <article class="panel">
        <h2>阻塞与 Gate</h2>
        <div id="blockers-list" class="stack"></div>
      </article>
      <article class="panel">
        <h2>启动 Runner</h2>
        <form id="runner-form" class="runner-form">
          <label>命令
            <select id="command-type">
              <option value="intake">/intake</option>
              <option value="go">/go</option>
              <option value="recover">/recover</option>
            </select>
          </label>
          <label>目标名
            <input id="target-name" type="text" pattern="[一-龥A-Za-z0-9_-]+" required>
          </label>
          <button class="button primary" type="submit">启动</button>
        </form>
        <div id="runs-list" class="stack"></div>
      </article>
    </section>

    <section class="panel">
      <h2>最近日志</h2>
      <div id="logs-list" class="log-list"></div>
    </section>
  </main>
  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create CSS**

Create `control-plane/src/public/styles.css`:

```css
:root {
  --color-bg: #0f1419;
  --color-panel: #1c2732;
  --color-border: #2f3b47;
  --color-primary: #1d9bf0;
  --color-success: #00ba7c;
  --color-danger: #f9197f;
  --color-text: #e7e9ea;
  --color-muted: #8899a6;
  --radius-card: 12px;
  --radius-control: 8px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  text-wrap: pretty;
}

.layout {
  width: min(1440px, calc(100vw - 48px));
  margin: 0 auto;
  padding: var(--space-6) 0 48px;
}

.hero {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-6);
  margin-bottom: 32px;
}

.eyebrow {
  color: var(--color-primary);
  font-size: 13px;
  letter-spacing: 0.12em;
  margin: 0 0 var(--space-2);
  text-transform: uppercase;
}

h1, h2, p { margin-top: 0; }

h1 {
  font-size: clamp(32px, 4vw, 56px);
  line-height: 1;
  margin-bottom: var(--space-3);
}

h2 {
  color: var(--color-text);
  font-size: 18px;
  margin-bottom: var(--space-4);
}

.subtitle {
  color: var(--color-muted);
  max-width: 680px;
  margin-bottom: 0;
}

.actions, .runner-form {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}

.button, input, select {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: #111922;
  color: var(--color-text);
  min-height: 40px;
  padding: 0 var(--space-4);
  transition: border-color 120ms ease, transform 120ms ease, background 120ms ease;
}

.button { cursor: pointer; }
.button:hover { border-color: var(--color-primary); transform: translateY(-1px); }
.button:focus, input:focus, select:focus { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.button.primary { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }

.stats-grid, .two-column {
  display: grid;
  gap: var(--space-5);
  margin-bottom: var(--space-5);
}

.stats-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.two-column { grid-template-columns: 1fr 1fr; }

.stat-card, .panel, .project-card, .notice, .run-row, .log-row {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-panel);
}

.stat-card { padding: var(--space-5); }
.stat-card span { display: block; color: var(--color-primary); font-size: 36px; font-weight: 800; line-height: 1; }
.stat-card small { color: var(--color-muted); display: block; margin-top: var(--space-2); }

.panel { padding: var(--space-5); margin-bottom: var(--space-5); }
.panel-heading { display: flex; justify-content: space-between; gap: var(--space-4); }
.panel-heading p { color: var(--color-muted); margin-bottom: 0; }

.project-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-4); }
.project-card { padding: var(--space-4); }
.project-card h3 { margin: 0 0 var(--space-3); }
.meta { color: var(--color-muted); font-size: 13px; }
.badges { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); }
.badge { border-radius: 999px; padding: 3px 9px; font-size: 12px; background: #111922; color: var(--color-muted); }
.badge.pass, .badge.done, .badge.completed { color: var(--color-success); }
.badge.fail, .badge.warning, .badge.blocked, .badge.failed { color: var(--color-danger); }
.badge.running, .badge.in_progress { color: var(--color-primary); }

.stack { display: grid; gap: var(--space-3); }
.notice, .run-row, .log-row { padding: var(--space-3); }
.notice strong { display: block; margin-bottom: var(--space-1); }
.log-list { display: grid; gap: var(--space-2); }
.log-row { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; color: var(--color-muted); }
.log-row.error { color: var(--color-danger); }

.runner-form { align-items: flex-end; margin-bottom: var(--space-4); }
.runner-form label { color: var(--color-muted); display: grid; gap: var(--space-2); flex: 1; }

@media (max-width: 900px) {
  .hero, .actions, .runner-form { flex-direction: column; align-items: stretch; }
  .stats-grid, .two-column { grid-template-columns: 1fr; }
}
```

- [ ] **Step 5: Create browser JavaScript**

Create `control-plane/src/public/app.js`:

```js
async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

function setText(id, value) {
  document.getElementById(id).textContent = String(value);
}

function renderProjects(projects) {
  const target = document.getElementById('projects-list');
  if (projects.length === 0) {
    target.innerHTML = '<article class="project-card"><p class="meta">没有发现带 .status.json 的项目。</p></article>';
    return;
  }

  target.innerHTML = projects.map(project => `
    <article class="project-card">
      <h3>${project.name}</h3>
      <p class="meta">${project.phase} · ${project.complexity || 'unknown'} · reopen=${project.reopenCount}</p>
      <p class="meta">${project.rootPath}</p>
      <div class="badges"><span class="badge">${project.updatedAt}</span></div>
    </article>
  `).join('');
}

function renderBlockers(blockers, failingGates) {
  const target = document.getElementById('blockers-list');
  const rows = [];
  blockers.forEach(blocker => rows.push(`<div class="notice"><strong>${blocker.projectName} / ${blocker.agent}</strong><span>${blocker.reason}</span></div>`));
  failingGates.forEach(gate => rows.push(`<div class="notice"><strong>${gate.projectName} / ${gate.gate}</strong><span>${gate.status} · ${gate.evidencePath || '无证据路径'}</span></div>`));
  target.innerHTML = rows.length ? rows.join('') : '<p class="meta">当前没有阻塞或失败 Gate。</p>';
}

function renderRuns(runs) {
  const target = document.getElementById('runs-list');
  target.innerHTML = runs.length
    ? runs.map(run => `<div class="run-row"><span class="badge ${run.status}">${run.status}</span> /${run.commandType} ${run.targetName}<br><span class="meta">${run.logPath}</span></div>`).join('')
    : '<p class="meta">暂无 Runner 记录。</p>';
}

function renderLogs(logs) {
  const target = document.getElementById('logs-list');
  target.innerHTML = logs.length
    ? logs.map(log => `<div class="log-row ${log.level}">[${log.agent}] ${log.message}</div>`).join('')
    : '<p class="meta">暂无日志。</p>';
}

async function loadDashboard() {
  setText('status-message', '加载中');
  const data = await fetchJson('/api/dashboard');
  setText('total-projects', data.summary.totalProjects);
  setText('active-agents', data.summary.activeAgents);
  setText('blocked-projects', data.summary.blockedProjects);
  setText('lessons-count', data.summary.lessonsCount);
  renderProjects(data.projects);
  renderBlockers(data.blockers, data.failingGates);
  renderRuns(data.runs);
  renderLogs(data.recentLogs);
  setText('status-message', `更新于 ${new Date(data.timestamp).toLocaleTimeString()}`);
}

async function rebuildIndex() {
  setText('status-message', '重建索引中');
  const result = await fetchJson('/api/index/rebuild', { method: 'POST' });
  setText('status-message', `索引完成：${result.indexedProjects} 个项目，${result.errors.length} 个错误`);
  await loadDashboard();
}

async function startRunner(event) {
  event.preventDefault();
  const commandType = document.getElementById('command-type').value;
  const targetName = document.getElementById('target-name').value.trim();
  const run = await fetchJson('/api/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandType, targetName })
  });
  setText('status-message', `Runner 完成：${run.status}`);
  await loadDashboard();
}

document.getElementById('rebuild-index').addEventListener('click', () => rebuildIndex().catch(error => setText('status-message', error.message)));
document.getElementById('refresh-dashboard').addEventListener('click', () => loadDashboard().catch(error => setText('status-message', error.message)));
document.getElementById('runner-form').addEventListener('submit', event => startRunner(event).catch(error => setText('status-message', error.message)));

loadDashboard().catch(error => setText('status-message', error.message));
```

- [ ] **Step 6: Run static UI and API tests**

Run:

```bash
cd control-plane && npm test -- tests/publicFiles.test.js tests/dashboardApi.test.js
```

Expected: PASS for both test files.

- [ ] **Step 7: Commit**

Run:

```bash
git add control-plane/src/public control-plane/tests/publicFiles.test.js
git commit -m "feat: add local web console"
```

---

### Task 9: Wire startup with real database, indexer, and API smoke checks

**Files:**
- Modify: `control-plane/src/server.js`
- Modify: `control-plane/package.json`
- Create: `control-plane/tests/startup.integration.test.js`

- [ ] **Step 1: Write failing startup integration test**

Create `control-plane/tests/startup.integration.test.js`:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { afterEach, beforeEach, describe, expect, it } = require('vitest');
const { createAppWithRuntime } = require('../src/server');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-plane-startup-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('runtime app wiring', () => {
  it('indexes a project through real app dependencies', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(path.join(projectsDir, 'demo'), { recursive: true });
    fs.writeFileSync(path.join(projectsDir, 'demo', '.status.json'), JSON.stringify({
      project: 'demo',
      phase: 'build',
      complexity: 'small',
      agents: { backend: { status: 'done' } },
      gates: { gate3: 'pass' },
      updatedAt: '2026-05-22T06:00:00.000Z'
    }));

    const { app, db } = createAppWithRuntime({
      CONTROL_PLANE_DB: path.join(tmpDir, 'db', 'control-plane.db'),
      PROJECTS_DIR: projectsDir,
      QA_REPORTS_DIR: path.join(tmpDir, 'qa'),
      AGENT_LOGS_DIR: path.join(tmpDir, 'logs'),
      LESSONS_DIR: path.join(tmpDir, 'lessons'),
      CLAUDE_ASSETS_DIR: 'H:/claude-assets'
    });

    const rebuild = await request(app).post('/api/index/rebuild');
    const dashboard = await request(app).get('/api/dashboard');

    db.close();
    expect(rebuild.body).toEqual({ indexedProjects: 1, errors: [] });
    expect(dashboard.body.projects[0].name).toBe('demo');
    expect(dashboard.body.summary.totalProjects).toBe(1);
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
cd control-plane && npm test -- tests/startup.integration.test.js
```

Expected: FAIL because `createAppWithRuntime` is not exported.

- [ ] **Step 3: Replace server entrypoint with testable runtime factory**

Replace `control-plane/src/server.js` with:

```js
const { createApp } = require('./app');
const { createConfig } = require('./config');
const { openDatabase } = require('./db');
const { createStore } = require('./store');
const { createProjectIndexer } = require('./indexer/projectIndexer');
const { createClaudeRunner } = require('./runner/claudeRunner');

function createAppWithRuntime(env) {
  const config = createConfig(env);
  const db = openDatabase(config.databasePath);
  const store = createStore(db);
  const indexer = createProjectIndexer({ config, store });
  const runner = createClaudeRunner({ config, store });
  const app = createApp({ config, store, indexer, runner });
  return { app, config, db, store, indexer, runner };
}

function startServer() {
  const { app, config } = createAppWithRuntime(process.env);
  app.listen(config.port, config.host, () => {
    process.stdout.write(`Control Plane running at http://${config.host}:${config.port}\n`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { createAppWithRuntime, startServer };
```

- [ ] **Step 4: Add smoke script command**

Modify the `scripts` section in `control-plane/package.json` to exactly:

```json
{
  "dev": "node src/server.js",
  "start": "node src/server.js",
  "test": "vitest run --coverage",
  "test:watch": "vitest",
  "smoke": "node -e \"fetch('http://127.0.0.1:3100/api/health').then(r=>r.json()).then(j=>{if(!j.ok)process.exit(1);console.log(JSON.stringify(j))})\"",
  "audit:prod": "npm audit --omit=dev"
}
```

- [ ] **Step 5: Run startup and full test suite**

Run:

```bash
cd control-plane && npm test
```

Expected: PASS with coverage lines at or above 80%.

- [ ] **Step 6: Commit**

Run:

```bash
git add control-plane/src/server.js control-plane/package.json control-plane/tests/startup.integration.test.js
git commit -m "feat: wire control plane runtime"
```

---

### Task 10: Verify manually in the browser and document execution evidence

**Files:**
- No source file changes expected unless verification finds a defect.

- [ ] **Step 1: Run automated verification**

Run:

```bash
cd control-plane && npm test && npm run audit:prod
```

Expected:

```text
Test Files  11 passed
Tests       20 passed
No vulnerabilities found
```

The exact Vitest timing can differ. The pass counts must match or exceed the numbers above.

- [ ] **Step 2: Start the local Web Console**

Run:

```bash
cd control-plane && npm run dev
```

Expected terminal output:

```text
Control Plane running at http://127.0.0.1:3100
```

- [ ] **Step 3: Verify health endpoint**

In another terminal, run:

```bash
cd control-plane && npm run smoke
```

Expected output contains:

```json
{"ok":true,"service":"one-person-dev-company-control-plane","version":"0.1.0"}
```

- [ ] **Step 4: Verify UI with browser automation**

Use Playwright MCP or Chrome DevTools MCP:

1. Open `http://127.0.0.1:3100`.
2. Confirm the page title reads `One Person Dev Company OS`.
3. Click `重建索引`.
4. Confirm `项目` count updates to the number of indexed `.status.json` projects under `E:/projects`.
5. Confirm `阻塞项目` shows non-zero only when an indexed project has an Agent with `status=blocked`.
6. Confirm browser console has no errors or warnings.
7. Resize to 375px wide and confirm cards stack vertically without horizontal overflow.

- [ ] **Step 5: Stop the dev server**

Press `Ctrl+C` in the terminal running `npm run dev`.

Expected: process exits and port `3100` is free for the next run.

- [ ] **Step 6: Commit verification fixes if any were needed**

If verification required source changes, run:

```bash
git add control-plane
git commit -m "fix: stabilize control plane verification"
```

If no source changes were needed, do not create an empty commit.

---

## Self-Review

Spec coverage:

- Phase 0 read-only indexing: Task 4 and Task 9.
- SQLite as rebuildable index: Task 3 and Task 9.
- File system as truth source: Task 4 reads `.status.json`; no task writes project artifacts.
- Local Web Console: Task 8 and Task 10.
- Control Plane API: Task 1, Task 6, Task 9.
- Claude Code headless runner: Task 7.
- Blocked, failing Gate, and recent run visibility: Task 6 and Task 8.
- Browser verification: Task 10.

Plan integrity:

- No unfinished markers remain.
- Every code-changing step names exact files.
- Every test step includes exact commands and expected result.
- Types and property names stay consistent: `projectName`, `rootPath`, `reopenCount`, `commandType`, `targetName`, `logPath`.
- Full spec Phase 2 to Phase 5 is intentionally excluded and listed under Scope Boundary.
