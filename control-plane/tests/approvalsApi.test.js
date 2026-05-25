const request = require('supertest');
const Database = require('better-sqlite3');
const { createApp } = require('../src/app');
const { createStore } = require('../src/store');

function createDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (
      name TEXT PRIMARY KEY,
      root_path TEXT NOT NULL,
      phase TEXT NOT NULL,
      complexity TEXT NOT NULL,
      reopen_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      last_run TEXT,
      block_reason TEXT
    );
    CREATE TABLE gates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope_type TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      gate_name TEXT NOT NULL,
      status TEXT NOT NULL,
      evidence_path TEXT,
      checked_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(scope_type, scope_id, gate_name)
    );
    CREATE TABLE artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      type TEXT NOT NULL,
      path TEXT NOT NULL,
      hash TEXT,
      mtime_ms INTEGER,
      summary TEXT,
      indexed_at TEXT
    );
    CREATE TABLE runs (
      id TEXT PRIMARY KEY,
      command_type TEXT NOT NULL,
      target_name TEXT NOT NULL,
      status TEXT NOT NULL,
      prompt TEXT,
      log_path TEXT,
      exit_code INTEGER,
      error_message TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      session_id TEXT,
      token_in INTEGER,
      token_out INTEGER,
      duration_ms INTEGER,
      cost_cents REAL
    );
    CREATE TABLE approvals (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      prompt_snapshot TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      resolution_note TEXT
    );
    CREATE TABLE change_requests (
      id TEXT PRIMARY KEY,
      project_name TEXT NOT NULL,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      scope TEXT NOT NULL,
      current_behavior TEXT NOT NULL,
      expected_behavior TEXT NOT NULL,
      acceptance_criteria TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'open',
      ia_run_id TEXT,
      patch_run_id TEXT,
      regression_run_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE cr_documents (
      cr_id TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      path TEXT NOT NULL,
      content_summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (cr_id, doc_type)
    );
    CREATE TABLE regression_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cr_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      status TEXT NOT NULL,
      total_tests INTEGER,
      passed_tests INTEGER,
      failed_tests INTEGER,
      report_path TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE raw_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      source TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE episodes (
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
    CREATE TABLE facts (
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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE retrieval_packs (
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
    CREATE TABLE products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      client_name TEXT,
      root_path TEXT,
      status TEXT NOT NULL DEFAULT 'idea',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE milestones (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned',
      gate_scope TEXT,
      target_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE workstreams (
      id TEXT PRIMARY KEY,
      milestone_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'todo',
      owner_role TEXT,
      project_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      workstream_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'backlog',
      agent_role TEXT,
      priority TEXT,
      acceptance_ref TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

function makeApp(db) {
  const store = createStore(db);
  return createApp({
    config: {
      claudeCommand: 'claude',
      claudeAssetsDir: 'H:/claude-assets',
      logsDir: '/tmp/logs',
      projectsDir: 'E:/projects',
      lessonsDir: 'H:/claude-assets/lessons',
      version: 'test'
    },
    store,
    indexer: { rebuild: () => ({ indexedProjects: 0 }) },
    runner: null,
    watcherFactory: null
  });
}

function seedRun(db) {
  db.prepare(`
    INSERT INTO runs (id, command_type, target_name, status, prompt, log_path, started_at)
    VALUES ('run-1', 'go', 'demo', 'running', '/go demo', '/tmp/run-1.log', '2026-05-24T10:00:00.000Z')
  `).run();
}

function seedApproval(db, id = 'apr-1', status = 'pending') {
  db.prepare(`
    INSERT INTO approvals (id, run_id, prompt_snapshot, status, created_at)
    VALUES (?, 'run-1', 'Agent output with [AWAIT_APPROVAL]', ?, '2026-05-24T10:01:00.000Z')
  `).run(id, status);
}

describe('GET /api/approvals', () => {
  it('returns empty list when no pending approvals', async () => {
    const db = createDb();
    const app = makeApp(db);
    const res = await request(app).get('/api/approvals');
    expect(res.status).toBe(200);
    expect(res.body.approvals).toEqual([]);
  });

  it('returns pending approvals', async () => {
    const db = createDb();
    seedRun(db);
    seedApproval(db);
    const app = makeApp(db);
    const res = await request(app).get('/api/approvals');
    expect(res.status).toBe(200);
    expect(res.body.approvals).toHaveLength(1);
    expect(res.body.approvals[0]).toMatchObject({ id: 'apr-1', runId: 'run-1', status: 'pending' });
  });

  it('does not return resolved approvals', async () => {
    const db = createDb();
    seedRun(db);
    seedApproval(db, 'apr-1', 'approved');
    const app = makeApp(db);
    const res = await request(app).get('/api/approvals');
    expect(res.status).toBe(200);
    expect(res.body.approvals).toEqual([]);
  });
});

describe('POST /api/approvals/:id/approve', () => {
  it('approves a pending approval', async () => {
    const db = createDb();
    seedRun(db);
    seedApproval(db);
    const app = makeApp(db);
    const res = await request(app).post('/api/approvals/apr-1/approve').send({ note: 'looks good' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
    expect(res.body.resolutionNote).toBe('looks good');
    expect(res.body.resolvedAt).toBeTruthy();
  });

  it('returns 404 for unknown approval', async () => {
    const db = createDb();
    const app = makeApp(db);
    const res = await request(app).post('/api/approvals/nope/approve').send({});
    expect(res.status).toBe(404);
  });

  it('returns 400 when approval is already resolved', async () => {
    const db = createDb();
    seedRun(db);
    seedApproval(db, 'apr-1', 'approved');
    const app = makeApp(db);
    const res = await request(app).post('/api/approvals/apr-1/approve').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/approvals/:id/reject', () => {
  it('rejects a pending approval', async () => {
    const db = createDb();
    seedRun(db);
    seedApproval(db);
    const app = makeApp(db);
    const res = await request(app).post('/api/approvals/apr-1/reject').send({ note: 'too risky' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
    expect(res.body.resolutionNote).toBe('too risky');
  });

  it('returns 404 for unknown approval', async () => {
    const db = createDb();
    const app = makeApp(db);
    const res = await request(app).post('/api/approvals/nope/reject').send({});
    expect(res.status).toBe(404);
  });

  it('returns 400 when approval is already resolved', async () => {
    const db = createDb();
    seedRun(db);
    seedApproval(db, 'apr-1', 'rejected');
    const app = makeApp(db);
    const res = await request(app).post('/api/approvals/apr-1/reject').send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/stats/costs', () => {
  it('returns zero totals when no runs', async () => {
    const db = createDb();
    const app = makeApp(db);
    const res = await request(app).get('/api/stats/costs');
    expect(res.status).toBe(200);
    expect(res.body.totalCostCents).toBe(0);
    expect(res.body.byCommandType).toEqual([]);
  });

  it('returns cost summary grouped by commandType', async () => {
    const db = createDb();
    db.prepare(`
      INSERT INTO runs (id, command_type, target_name, status, prompt, log_path, started_at, token_in, token_out, cost_cents)
      VALUES ('r1', 'go', 'demo', 'completed', '', '', '2026-05-24T10:00:00.000Z', 1000, 500, 2.25)
    `).run();
    db.prepare(`
      INSERT INTO runs (id, command_type, target_name, status, prompt, log_path, started_at, token_in, token_out, cost_cents)
      VALUES ('r2', 'go', 'demo2', 'completed', '', '', '2026-05-24T11:00:00.000Z', 2000, 1000, 4.50)
    `).run();
    db.prepare(`
      INSERT INTO runs (id, command_type, target_name, status, prompt, log_path, started_at, token_in, token_out, cost_cents)
      VALUES ('r3', 'intake', 'proj', 'completed', '', '', '2026-05-24T12:00:00.000Z', 500, 200, 1.05)
    `).run();
    const app = makeApp(db);
    const res = await request(app).get('/api/stats/costs');
    expect(res.status).toBe(200);
    expect(res.body.totalCostCents).toBeCloseTo(7.8);
    expect(res.body.byCommandType).toHaveLength(2);
    const goRow = res.body.byCommandType.find(r => r.commandType === 'go');
    expect(goRow.runCount).toBe(2);
    expect(goRow.totalCostCents).toBeCloseTo(6.75);
  });
});
