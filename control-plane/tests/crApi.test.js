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
      finished_at TEXT
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
