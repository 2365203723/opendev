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
      project_name TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      evidence_path TEXT
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
  `);
  return db;
}

function seedProject(store) {
  store.replaceProjectIndex({
    project: {
      name: 'demo',
      rootPath: 'E:/projects/demo',
      phase: 'build',
      complexity: 'small',
      reopenCount: 0,
      updatedAt: '2026-05-22T01:00:00.000Z'
    },
    agents: [],
    gates: [],
    artifacts: []
  });
}

const validBody = {
  projectName: 'demo',
  title: 'fix login button',
  source: 'user_input',
  scope: 'project',
  currentBehavior: 'clicking login button does nothing',
  expectedBehavior: 'clicking login button redirects to home',
  acceptanceCriteria: ['login success redirects', 'error shows message']
};

describe('CR CRUD API', () => {
  let app;
  let store;

  beforeEach(() => {
    const db = createDb();
    store = createStore(db);
    seedProject(store);
    app = createApp({
      config: {
        version: '0.1.0',
        logsDir: 'missing',
        lessonsDir: 'missing',
        claudeAssetsDir: 'missing'
      },
      store,
      indexer: { rebuild: () => ({ indexedProjects: 1, errors: [] }) },
      runner: null
    });
  });

  describe('POST /api/change-requests', () => {
    it('valid body returns 201 with CR object, status open, all required fields', async () => {
      const res = await request(app).post('/api/change-requests').send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body.projectName).toBe('demo');
      expect(res.body.title).toBe('fix login button');
      expect(res.body.source).toBe('user_input');
      expect(res.body.scope).toBe('project');
      expect(res.body.currentBehavior).toBe('clicking login button does nothing');
      expect(res.body.expectedBehavior).toBe('clicking login button redirects to home');
      expect(res.body.acceptanceCriteria).toBeTruthy();
      expect(res.body.priority).toBe('medium');
      expect(res.body.status).toBe('open');
      expect(res.body.createdAt).toBeTruthy();
      expect(res.body.updatedAt).toBeTruthy();
    });

    it('missing title returns 400', async () => {
      const { title: _t, ...body } = validBody;
      const res = await request(app).post('/api/change-requests').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it('missing source returns 400', async () => {
      const { source: _s, ...body } = validBody;
      const res = await request(app).post('/api/change-requests').send(body);
      expect(res.status).toBe(400);
    });

    it('missing scope returns 400', async () => {
      const { scope: _s, ...body } = validBody;
      const res = await request(app).post('/api/change-requests').send(body);
      expect(res.status).toBe(400);
    });

    it('missing currentBehavior returns 400', async () => {
      const { currentBehavior: _c, ...body } = validBody;
      const res = await request(app).post('/api/change-requests').send(body);
      expect(res.status).toBe(400);
    });

    it('missing expectedBehavior returns 400', async () => {
      const { expectedBehavior: _e, ...body } = validBody;
      const res = await request(app).post('/api/change-requests').send(body);
      expect(res.status).toBe(400);
    });

    it('missing acceptanceCriteria returns 400', async () => {
      const { acceptanceCriteria: _a, ...body } = validBody;
      const res = await request(app).post('/api/change-requests').send(body);
      expect(res.status).toBe(400);
    });

    it('nonexistent projectName returns 404', async () => {
      const res = await request(app)
        .post('/api/change-requests')
        .send({ ...validBody, projectName: 'nonexistent' });
      expect(res.status).toBe(404);
    });

    it('created CR is visible in GET /api/change-requests', async () => {
      const createRes = await request(app).post('/api/change-requests').send(validBody);
      expect(createRes.status).toBe(201);
      const crId = createRes.body.id;

      const listRes = await request(app).get('/api/change-requests');
      expect(listRes.status).toBe(200);
      const ids = listRes.body.changeRequests.map(cr => cr.id);
      expect(ids).toContain(crId);
    });
  });

  describe('GET /api/change-requests', () => {
    it('returns 200 with changeRequests array', async () => {
      const res = await request(app).get('/api/change-requests');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.changeRequests)).toBe(true);
    });

    it('?projectName=demo returns only that project CRs', async () => {
      await request(app).post('/api/change-requests').send(validBody);

      const res = await request(app).get('/api/change-requests?projectName=demo');
      expect(res.status).toBe(200);
      expect(res.body.changeRequests.length).toBeGreaterThan(0);
      res.body.changeRequests.forEach(cr => {
        expect(cr.projectName).toBe('demo');
      });
    });
  });

  describe('GET /api/change-requests/:id', () => {
    it('existing CR returns 200 with CR details and documents array', async () => {
      const createRes = await request(app).post('/api/change-requests').send(validBody);
      const crId = createRes.body.id;

      const res = await request(app).get(`/api/change-requests/${crId}`);
      expect(res.status).toBe(200);
      expect(res.body.cr).toBeTruthy();
      expect(res.body.cr.id).toBe(crId);
      expect(Array.isArray(res.body.documents)).toBe(true);
    });

    it('nonexistent CR returns 404', async () => {
      const res = await request(app).get('/api/change-requests/nonexistent-id');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/change-requests/:id/cancel', () => {
    it('open CR returns 200 with status cancelled', async () => {
      const createRes = await request(app).post('/api/change-requests').send(validBody);
      const crId = createRes.body.id;

      const res = await request(app).patch(`/api/change-requests/${crId}/cancel`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('cancelled');
    });

    it('released CR returns 400', async () => {
      const createRes = await request(app).post('/api/change-requests').send(validBody);
      const crId = createRes.body.id;

      const now = new Date().toISOString();
      store.updateCrStatus(crId, { status: 'released', updatedAt: now });

      const res = await request(app).patch(`/api/change-requests/${crId}/cancel`);
      expect(res.status).toBe(400);
    });

    it('nonexistent CR returns 404', async () => {
      const res = await request(app).patch('/api/change-requests/nonexistent-id/cancel');
      expect(res.status).toBe(404);
    });
  });

  describe('triggerIa with runner', () => {
    it('runner success: updates status to ia_done and upserts documents', async () => {
      const run = { id: 'run-ia-1' };
      const runner = { start: vi.fn(async () => run) };
      const appWithRunner = createApp({
        config: {
          version: '0.1.0',
          logsDir: 'missing',
          lessonsDir: 'missing',
          claudeAssetsDir: 'H:/tmp'
        },
        store,
        indexer: { rebuild: () => ({ indexedProjects: 1, errors: [] }) },
        runner
      });

      const createRes = await request(appWithRunner).post('/api/change-requests').send(validBody);
      expect(createRes.status).toBe(201);
      const crId = createRes.body.id;

      // wait for setImmediate to fire
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));

      expect(runner.start).toHaveBeenCalledWith(expect.objectContaining({
        commandType: 'patch',
        crId,
        patchPhase: 'ia'
      }));

      const cr = store.getCr(crId);
      expect(cr.status).toBe('ia_done');
      expect(cr.iaRunId).toBe('run-ia-1');
    });

    it('runner failure: reverts status to open', async () => {
      const runner = { start: vi.fn(async () => { throw new Error('runner error'); }) };
      const appWithRunner = createApp({
        config: {
          version: '0.1.0',
          logsDir: 'missing',
          lessonsDir: 'missing',
          claudeAssetsDir: 'H:/tmp'
        },
        store,
        indexer: { rebuild: () => ({ indexedProjects: 1, errors: [] }) },
        runner
      });

      const createRes = await request(appWithRunner).post('/api/change-requests').send(validBody);
      expect(createRes.status).toBe(201);
      const crId = createRes.body.id;

      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));

      const cr = store.getCr(crId);
      expect(cr.status).toBe('open');
    });

    it('tech keyword in title routes to architect agent', async () => {
      const run = { id: 'run-arch-1' };
      const runner = { start: vi.fn(async () => run) };
      const appWithRunner = createApp({
        config: {
          version: '0.1.0',
          logsDir: 'missing',
          lessonsDir: 'missing',
          claudeAssetsDir: 'H:/tmp'
        },
        store,
        indexer: { rebuild: () => ({ indexedProjects: 1, errors: [] }) },
        runner
      });

      const techBody = { ...validBody, title: 'database schema migration' };
      const createRes = await request(appWithRunner).post('/api/change-requests').send(techBody);
      expect(createRes.status).toBe(201);

      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));

      expect(runner.start).toHaveBeenCalledWith(expect.objectContaining({
        agentRole: 'architect'
      }));
    });
  });
});

// ---------------------------------------------------------------------------
// Helper: build an app with a controllable mock runner
// ---------------------------------------------------------------------------
function buildAppWithRunner(store, runnerMock) {
  return createApp({
    config: {
      version: '0.1.0',
      logsDir: 'missing',
      lessonsDir: 'missing',
      claudeAssetsDir: 'H:/tmp'
    },
    store,
    indexer: { rebuild: () => ({ indexedProjects: 1, errors: [] }) },
    runner: runnerMock
  });
}

// Helper: create a CR in ia_done status with a patch_plan document
async function createIaDoneCr(store, appInstance) {
  const createRes = await request(appInstance).post('/api/change-requests').send(validBody);
  expect(createRes.status).toBe(201);
  const crId = createRes.body.id;
  const now = new Date().toISOString();
  store.updateCrStatus(crId, { status: 'ia_done', updatedAt: now });
  store.upsertCrDocument(crId, 'patch_plan', 'H:/tmp/patch-plan.md', 'Patch Plan');
  return crId;
}

describe('POST /api/change-requests/:id/execute-patch', () => {
  let store;
  let db;

  beforeEach(() => {
    const Database = require('better-sqlite3');
    db = new Database(':memory:');
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
        project_name TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        evidence_path TEXT
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
      CREATE TABLE IF NOT EXISTS approvals (
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
    `);
    store = createStore(db);
    store.replaceProjectIndex({
      project: {
        name: 'demo',
        rootPath: 'E:/projects/demo',
        phase: 'build',
        complexity: 'small',
        reopenCount: 0,
        updatedAt: '2026-05-22T01:00:00.000Z'
      },
      agents: [],
      gates: [],
      artifacts: []
    });
  });

  it('ia_done + patch_plan exists → 202, status becomes patch_running', async () => {
    const runner = { start: vi.fn(async () => ({ id: 'run-patch-1', status: 'running' })) };
    const app = buildAppWithRunner(store, runner);
    const crId = await createIaDoneCr(store, app);

    const res = await request(app).post(`/api/change-requests/${crId}/execute-patch`);

    expect(res.status).toBe(202);
    const cr = store.getCr(crId);
    expect(cr.status).toBe('patch_running');
  });

  it('status not ia_done or patch_pending → 400', async () => {
    const runner = { start: vi.fn(async () => ({ id: 'run-x', status: 'running' })) };
    const app = buildAppWithRunner(store, runner);
    // Create CR and wait for IA to complete (runner mock resolves immediately)
    const createRes = await request(app).post('/api/change-requests').send(validBody);
    const crId = createRes.body.id;
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    // Force status to a non-ia_done/patch_pending value (e.g. ia_running)
    store.updateCrStatus(crId, { status: 'ia_running', updatedAt: new Date().toISOString() });

    const res = await request(app).post(`/api/change-requests/${crId}/execute-patch`);
    expect(res.status).toBe(400);
  });

  it('CR not found → 404', async () => {
    const runner = { start: vi.fn(async () => ({ id: 'run-x', status: 'running' })) };
    const app = buildAppWithRunner(store, runner);

    const res = await request(app).post('/api/change-requests/nonexistent-id/execute-patch');
    expect(res.status).toBe(404);
  });

  it('runner is null → 503', async () => {
    const app = buildAppWithRunner(store, null);
    const appNoRunner = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing', claudeAssetsDir: 'H:/tmp' },
      store,
      indexer: { rebuild: () => ({ indexedProjects: 1, errors: [] }) },
      runner: null
    });
    // Need a CR in ia_done — create via a runner-enabled app first
    const runnerTemp = { start: vi.fn(async () => ({ id: 'run-tmp', status: 'running' })) };
    const appTemp = buildAppWithRunner(store, runnerTemp);
    const crId = await createIaDoneCr(store, appTemp);

    const res = await request(appNoRunner).post(`/api/change-requests/${crId}/execute-patch`);
    expect(res.status).toBe(503);
  });

  it('patch_plan not found → 400 with "patch plan not found"', async () => {
    const runner = { start: vi.fn(async () => ({ id: 'run-x', status: 'running' })) };
    const app = buildAppWithRunner(store, runner);
    // Create CR and wait for IA to complete (runner mock resolves immediately, upserts patch_plan)
    const createRes = await request(app).post('/api/change-requests').send(validBody);
    const crId = createRes.body.id;
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    // Remove the patch_plan document so the check fails
    db.prepare('DELETE FROM cr_documents WHERE cr_id = ? AND doc_type = ?').run(crId, 'patch_plan');
    store.updateCrStatus(crId, { status: 'ia_done', updatedAt: new Date().toISOString() });

    const res = await request(app).post(`/api/change-requests/${crId}/execute-patch`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/patch plan not found/i);
  });

  it('another patch_running CR in same project → 409', async () => {
    const runner = { start: vi.fn(async () => ({ id: 'run-conflict', status: 'running' })) };
    const app = buildAppWithRunner(store, runner);

    // Create first CR and set it to patch_running
    const crId1 = await createIaDoneCr(store, app);
    store.updateCrStatus(crId1, { status: 'patch_running', updatedAt: new Date().toISOString() });

    // Create second CR in ia_done
    const crId2 = await createIaDoneCr(store, app);

    const res = await request(app).post(`/api/change-requests/${crId2}/execute-patch`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/another patch is running/i);
  });
});

describe('POST /api/change-requests/:id/trigger-regression', () => {
  let store;
  let db;

  beforeEach(() => {
    const Database = require('better-sqlite3');
    db = new Database(':memory:');
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
        project_name TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        evidence_path TEXT
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
      CREATE TABLE IF NOT EXISTS approvals (
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
    `);
    store = createStore(db);
    store.replaceProjectIndex({
      project: {
        name: 'demo',
        rootPath: 'E:/projects/demo',
        phase: 'build',
        complexity: 'small',
        reopenCount: 0,
        updatedAt: '2026-05-22T01:00:00.000Z'
      },
      agents: [],
      gates: [],
      artifacts: []
    });
  });

  it('patch_running CR → 202, status becomes regression_running', async () => {
    const runner = { start: vi.fn(async () => ({ id: 'run-reg-1', status: 'running' })) };
    const app = buildAppWithRunner(store, runner);

    const runnerTemp = { start: vi.fn(async () => ({ id: 'run-tmp2', status: 'running' })) };
    const appTemp = buildAppWithRunner(store, runnerTemp);
    const crId = await createIaDoneCr(store, appTemp);
    store.updateCrStatus(crId, { status: 'patch_running', updatedAt: new Date().toISOString() });

    const res = await request(app).post(`/api/change-requests/${crId}/trigger-regression`);
    expect(res.status).toBe(202);
    const cr = store.getCr(crId);
    expect(cr.status).toBe('regression_running');
  });

  it('CR not found → 404', async () => {
    const runner = { start: vi.fn(async () => ({ id: 'run-x', status: 'running' })) };
    const app = buildAppWithRunner(store, runner);

    const res = await request(app).post('/api/change-requests/nonexistent-id/trigger-regression');
    expect(res.status).toBe(404);
  });

  it('runner is null → 503', async () => {
    const appNoRunner = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing', claudeAssetsDir: 'H:/tmp' },
      store,
      indexer: { rebuild: () => ({ indexedProjects: 1, errors: [] }) },
      runner: null
    });
    const runnerTemp = { start: vi.fn(async () => ({ id: 'run-tmp3', status: 'running' })) };
    const appTemp = buildAppWithRunner(store, runnerTemp);
    const crId = await createIaDoneCr(store, appTemp);
    store.updateCrStatus(crId, { status: 'patch_running', updatedAt: new Date().toISOString() });

    const res = await request(appNoRunner).post(`/api/change-requests/${crId}/trigger-regression`);
    expect(res.status).toBe(503);
  });
});

describe('状态机推进（onComplete 回调）', () => {
  let store;
  let db;

  beforeEach(() => {
    const Database = require('better-sqlite3');
    db = new Database(':memory:');
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
        project_name TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        evidence_path TEXT
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
      CREATE TABLE IF NOT EXISTS approvals (
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
    `);
    store = createStore(db);
    store.replaceProjectIndex({
      project: {
        name: 'demo',
        rootPath: 'E:/projects/demo',
        phase: 'build',
        complexity: 'small',
        reopenCount: 0,
        updatedAt: '2026-05-22T01:00:00.000Z'
      },
      agents: [],
      gates: [],
      artifacts: []
    });
  });

  it('patch execute 完成（exitCode=0）→ status 变为 regression_running，自动触发 regression', async () => {
    let capturedOnComplete;
    let regressionOnComplete;

    const runner = {
      start: vi.fn(async (opts) => {
        if (opts.patchPhase === 'execute') {
          capturedOnComplete = opts.onComplete;
          return { id: 'run-exec-1', status: 'running' };
        }
        if (opts.patchPhase === 'regression') {
          regressionOnComplete = opts.onComplete;
          return { id: 'run-reg-1', status: 'running' };
        }
        return { id: 'run-other', status: 'running' };
      })
    };

    const app = buildAppWithRunner(store, runner);
    const crId = await createIaDoneCr(store, app);

    await request(app).post(`/api/change-requests/${crId}/execute-patch`);
    expect(capturedOnComplete).toBeDefined();

    // Simulate patch execute completing successfully
    capturedOnComplete({ id: 'run-exec-1', status: 'completed' });

    // Wait for async triggerRegression to fire
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));

    const cr = store.getCr(crId);
    expect(cr.status).toBe('regression_running');
    expect(runner.start).toHaveBeenCalledWith(expect.objectContaining({ patchPhase: 'regression' }));
  });

  it('patch execute 失败（exitCode≠0）→ status 变为 patch_pending', async () => {
    let capturedOnComplete;

    const runner = {
      start: vi.fn(async (opts) => {
        if (opts.patchPhase === 'execute') {
          capturedOnComplete = opts.onComplete;
        }
        return { id: 'run-exec-fail', status: 'running' };
      })
    };

    const app = buildAppWithRunner(store, runner);
    const crId = await createIaDoneCr(store, app);

    await request(app).post(`/api/change-requests/${crId}/execute-patch`);
    expect(capturedOnComplete).toBeDefined();

    // Simulate patch execute failing
    capturedOnComplete({ id: 'run-exec-fail', status: 'failed' });

    await new Promise(resolve => setImmediate(resolve));

    const cr = store.getCr(crId);
    expect(cr.status).toBe('patch_pending');
  });

  it('regression 完成（exitCode=0）→ status 变为 released，创建 regression_results 记录', async () => {
    let capturedRegressionOnComplete;

    const runner = {
      start: vi.fn(async (opts) => {
        if (opts.patchPhase === 'regression') {
          capturedRegressionOnComplete = opts.onComplete;
        }
        return { id: 'run-reg-ok', status: 'running' };
      })
    };

    const app = buildAppWithRunner(store, runner);
    const runnerTemp = { start: vi.fn(async () => ({ id: 'run-tmp4', status: 'running' })) };
    const appTemp = buildAppWithRunner(store, runnerTemp);
    const crId = await createIaDoneCr(store, appTemp);
    store.updateCrStatus(crId, { status: 'patch_running', updatedAt: new Date().toISOString() });

    await request(app).post(`/api/change-requests/${crId}/trigger-regression`);
    expect(capturedRegressionOnComplete).toBeDefined();

    // Simulate regression completing successfully
    capturedRegressionOnComplete({ id: 'run-reg-ok', status: 'completed' });

    await new Promise(resolve => setImmediate(resolve));

    const cr = store.getCr(crId);
    expect(cr.status).toBe('released');

    const result = store.getLatestRegressionResult(crId);
    expect(result).toBeTruthy();
    expect(result.status).toBe('passed');
  });

  it('regression 失败（exitCode≠0）→ status 变为 patch_pending，创建 regression_results 记录', async () => {
    let capturedRegressionOnComplete;

    const runner = {
      start: vi.fn(async (opts) => {
        if (opts.patchPhase === 'regression') {
          capturedRegressionOnComplete = opts.onComplete;
        }
        return { id: 'run-reg-fail', status: 'running' };
      })
    };

    const app = buildAppWithRunner(store, runner);
    const runnerTemp = { start: vi.fn(async () => ({ id: 'run-tmp5', status: 'running' })) };
    const appTemp = buildAppWithRunner(store, runnerTemp);
    const crId = await createIaDoneCr(store, appTemp);
    store.updateCrStatus(crId, { status: 'patch_running', updatedAt: new Date().toISOString() });

    await request(app).post(`/api/change-requests/${crId}/trigger-regression`);
    expect(capturedRegressionOnComplete).toBeDefined();

    // Simulate regression failing
    capturedRegressionOnComplete({ id: 'run-reg-fail', status: 'failed' });

    await new Promise(resolve => setImmediate(resolve));

    const cr = store.getCr(crId);
    expect(cr.status).toBe('patch_pending');

    const result = store.getLatestRegressionResult(crId);
    expect(result).toBeTruthy();
    expect(result.status).toBe('failed');
  });
});
