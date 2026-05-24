const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { openDatabase } = require('../src/db');
const { createStore } = require('../src/store');
const { createApp } = require('../src/app');
const { createConcurrencyControl } = require('../src/concurrencyControl');

let tmpDir;
let db;
let app;
let store;
let concurrency;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-lock-api-test-'));
  db = openDatabase(path.join(tmpDir, 'test.db'));
  store = createStore(db);
  concurrency = createConcurrencyControl();
  app = createApp({
    config: {
      version: 'test',
      projectsDir: path.join(tmpDir, 'projects'),
      logsDir: path.join(tmpDir, 'logs'),
      lessonsDir: path.join(tmpDir, 'lessons'),
      claudeAssetsDir: tmpDir
    },
    store,
    concurrency,
    indexer: { rebuild: () => ({ indexedProjects: 0, errors: [] }) },
    runner: null,
    watcherFactory: null
  });
});

afterEach(() => {
  if (typeof app.close === 'function') app.close();
  if (db) db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('run concurrency locks', () => {
  it('returns 503 when runner is unavailable', async () => {
    const res = await request(app)
      .post('/api/runs')
      .send({ commandType: 'go', targetName: 'demo', scopeType: 'project', projectPath: 'E:/projects/demo' })
      .expect(503);
    expect(res.body.error).toBe('runner unavailable');
  });

  it('returns 409 when projectPath is already locked by another runner', async () => {
    // Acquire the lock externally to simulate a running job
    const held = concurrency.tryAcquire('existing-run-id', {
      scopeType: 'project',
      projectPath: 'E:/projects/demo'
    });
    expect(held.success).toBe(true);

    const res = await request(app)
      .post('/api/runs')
      .send({ commandType: 'go', targetName: 'demo', scopeType: 'project', projectPath: 'E:/projects/demo' })
      .expect(409);

    expect(res.body.error).toContain('locked');
  });

  it('returns 409 when workstreamId is already locked', async () => {
    const held = concurrency.tryAcquire('existing-run-id', {
      scopeType: 'workstream',
      workstreamId: 'ws-001'
    });
    expect(held.success).toBe(true);

    const res = await request(app)
      .post('/api/runs')
      .send({ commandType: 'go', targetName: 'demo', scopeType: 'workstream', workstreamId: 'ws-001' })
      .expect(409);

    expect(res.body.error).toContain('locked');
  });

  it('allows read-only run even when projectPath is locked', async () => {
    const held = concurrency.tryAcquire('existing-run-id', {
      scopeType: 'project',
      projectPath: 'E:/projects/demo'
    });
    expect(held.success).toBe(true);

    // runner is null so read-only run also gets 503, but importantly not 409
    const res = await request(app)
      .post('/api/runs')
      .send({ commandType: 'go', targetName: 'demo', scopeType: 'project', projectPath: 'E:/projects/demo', isReadOnly: true });

    expect(res.status).not.toBe(409);
  });

  it('GET /api/locks returns current lock state', async () => {
    concurrency.tryAcquire('runner-abc', { scopeType: 'project', projectPath: 'E:/projects/demo' });

    const res = await request(app).get('/api/locks').expect(200);

    expect(res.body.projectLocks).toHaveLength(1);
    expect(res.body.projectLocks[0].projectPath).toBe('E:/projects/demo');
    expect(res.body.projectLocks[0].runnerId).toBe('runner-abc');
    expect(res.body.workstreamLocks).toHaveLength(0);
  });
});
