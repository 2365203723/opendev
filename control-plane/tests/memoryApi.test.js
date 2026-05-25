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

function createMockRunner(store) {
  return {
    start: (payload) => {
      const id = require('crypto').randomUUID();
      const now = new Date().toISOString();
      store.createRun({
        id,
        commandType: payload.commandType,
        targetName: payload.targetName || payload.crId || 'mock',
        status: 'running',
        prompt: '',
        logPath: '',
        startedAt: now
      });
      store.finishRun({
        id,
        status: 'completed',
        exitCode: 0,
        errorMessage: null,
        finishedAt: now
      });
      const result = {
        id,
        commandType: payload.commandType,
        targetName: payload.targetName || payload.crId || 'mock',
        status: 'completed',
        exitCode: 0,
        startedAt: now,
        finishedAt: now
      };
      if (typeof payload.onComplete === 'function') {
        payload.onComplete(result);
      }
      return Promise.resolve(result);
    }
  };
}

const validCrBody = {
  projectName: 'demo',
  title: 'fix login button',
  source: 'user_input',
  scope: 'project',
  currentBehavior: 'clicking login button does nothing',
  expectedBehavior: 'clicking login button redirects to home',
  acceptanceCriteria: ['login success redirects', 'error shows message']
};

describe('Memory API', () => {
  let app;
  let store;

  beforeEach(() => {
    const db = createDb();
    store = createStore(db);
    seedProject(store);
    const mockRunner = createMockRunner(store);
    app = createApp({
      config: {
        version: '0.1.0',
        logsDir: 'missing',
        lessonsDir: 'missing',
        claudeAssetsDir: 'missing'
      },
      store,
      indexer: { rebuild: () => ({ indexedProjects: 3, errors: [] }) },
      runner: mockRunner
    });
  });

  // ─── 自动写入验证 ─────────────────────────────────────────────────────────────

  describe('自动写入：POST /api/runs 写入 command_run 事件', () => {
    it('POST /api/runs 成功后 GET /api/memory/events?eventType=command_run 能看到 source=control_plane 的事件', async () => {
      const runRes = await request(app)
        .post('/api/runs')
        .send({ commandType: 'intake', targetName: 'demo' });
      expect(runRes.status).toBe(202);

      const eventsRes = await request(app).get('/api/memory/events?eventType=command_run');
      expect(eventsRes.status).toBe(200);
      const events = eventsRes.body.events;
      expect(Array.isArray(events)).toBe(true);

      const ev = events.find(e => e.source === 'control_plane' && e.eventType === 'command_run');
      expect(ev).toBeTruthy();

      const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
      expect(payload.commandType).toBe('intake');
      expect(payload.targetName).toBe('demo');
    });
  });

  describe('自动写入：POST /api/index/rebuild 写入 command_run 事件', () => {
    it('rebuild 完成后 GET /api/memory/events?eventType=command_run 能看到 source=control_plane 的 rebuild 事件', async () => {
      const rebuildRes = await request(app).post('/api/index/rebuild');
      expect(rebuildRes.status).toBe(200);

      const eventsRes = await request(app).get('/api/memory/events?eventType=command_run');
      expect(eventsRes.status).toBe(200);
      const events = eventsRes.body.events;

      const ev = events.find(e => {
        const p = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload;
        return e.source === 'control_plane' && p.action === 'index_rebuild';
      });
      expect(ev).toBeTruthy();

      const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
      expect(payload.indexedProjects).toBe(3);
    });
  });

  describe('自动写入：PATCH /api/change-requests/:id/cancel 写入 agent_run 事件', () => {
    it('cancel CR 后 GET /api/memory/events?eventType=agent_run 能看到 source=control_plane 的事件，payload 含 fromStatus 和 toStatus', async () => {
      const crRes = await request(app).post('/api/change-requests').send(validCrBody);
      expect(crRes.status).toBe(201);
      const crId = crRes.body.id;

      const cancelRes = await request(app).patch(`/api/change-requests/${crId}/cancel`);
      expect(cancelRes.status).toBe(200);

      const eventsRes = await request(app).get('/api/memory/events?eventType=agent_run');
      expect(eventsRes.status).toBe(200);
      const events = eventsRes.body.events;

      const ev = events.find(e => e.source === 'control_plane' && e.eventType === 'agent_run');
      expect(ev).toBeTruthy();

      const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
      expect(payload.fromStatus).toBeTruthy();
      expect(payload.toStatus).toBe('cancelled');
    });
  });

  // ─── 手动写入 API ─────────────────────────────────────────────────────────────

  describe('POST /api/memory/events', () => {
    it('eventType=user_message 返回 201，含完整 event 对象', async () => {
      const res = await request(app)
        .post('/api/memory/events')
        .send({
          eventType: 'user_message',
          scopeType: 'project',
          scopeId: 'demo',
          payload: { message: '测试' },
          occurredAt: '2026-05-23T10:00:00.000Z'
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body.eventType).toBe('user_message');
      expect(res.body.scopeType).toBe('project');
      expect(res.body.scopeId).toBe('demo');
      expect(res.body.source).toBe('user');
      expect(res.body.occurredAt).toBe('2026-05-23T10:00:00.000Z');
      expect(res.body.createdAt).toBeTruthy();
      const payload = typeof res.body.payload === 'string' ? JSON.parse(res.body.payload) : res.body.payload;
      expect(payload.message).toBe('测试');
    });

    it('eventType=decision 返回 201', async () => {
      const res = await request(app)
        .post('/api/memory/events')
        .send({
          eventType: 'decision',
          scopeType: 'project',
          scopeId: 'demo',
          payload: { decision: '采用 REST' }
        });
      expect(res.status).toBe(201);
      expect(res.body.eventType).toBe('decision');
    });

    it('eventType=command_run 返回 400（不允许手动写入内部事件）', async () => {
      const res = await request(app)
        .post('/api/memory/events')
        .send({
          eventType: 'command_run',
          scopeType: 'company',
          scopeId: 'default',
          payload: { action: 'test' }
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it('缺少 eventType 返回 400', async () => {
      const res = await request(app)
        .post('/api/memory/events')
        .send({ scopeType: 'project', scopeId: 'demo', payload: {} });
      expect(res.status).toBe(400);
    });

    it('缺少 scopeType 返回 400', async () => {
      const res = await request(app)
        .post('/api/memory/events')
        .send({ eventType: 'user_message', scopeId: 'demo', payload: {} });
      expect(res.status).toBe(400);
    });

    it('缺少 scopeId 返回 400', async () => {
      const res = await request(app)
        .post('/api/memory/events')
        .send({ eventType: 'user_message', scopeType: 'project', payload: {} });
      expect(res.status).toBe(400);
    });

    it('缺少 payload 返回 400', async () => {
      const res = await request(app)
        .post('/api/memory/events')
        .send({ eventType: 'user_message', scopeType: 'project', scopeId: 'demo' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/memory/events', () => {
    beforeEach(async () => {
      await request(app).post('/api/memory/events').send({
        eventType: 'user_message',
        scopeType: 'project',
        scopeId: 'demo',
        payload: { message: 'msg1' }
      });
      await request(app).post('/api/memory/events').send({
        eventType: 'decision',
        scopeType: 'project',
        scopeId: 'demo',
        payload: { decision: 'd1' }
      });
      await request(app).post('/api/memory/events').send({
        eventType: 'user_message',
        scopeType: 'company',
        scopeId: 'acme',
        payload: { message: 'msg2' }
      });
    });

    it('GET /api/memory/events 返回 200，{ events: [...], total: N }', async () => {
      const res = await request(app).get('/api/memory/events');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.events)).toBe(true);
      expect(typeof res.body.total).toBe('number');
      expect(res.body.total).toBeGreaterThanOrEqual(3);
    });

    it('?scopeType=project&scopeId=demo 只返回该 scope 的事件', async () => {
      const res = await request(app).get('/api/memory/events?scopeType=project&scopeId=demo');
      expect(res.status).toBe(200);
      expect(res.body.events.length).toBeGreaterThanOrEqual(2);
      res.body.events.forEach(ev => {
        expect(ev.scopeType).toBe('project');
        expect(ev.scopeId).toBe('demo');
      });
    });

    it('?eventType=user_message 只返回该类型的事件', async () => {
      const res = await request(app).get('/api/memory/events?eventType=user_message');
      expect(res.status).toBe(200);
      res.body.events.forEach(ev => {
        expect(ev.eventType).toBe('user_message');
      });
      expect(res.body.events.length).toBeGreaterThanOrEqual(2);
    });

    it('?limit=2&offset=0 分页正确', async () => {
      const res = await request(app).get('/api/memory/events?limit=2&offset=0');
      expect(res.status).toBe(200);
      expect(res.body.events.length).toBeLessThanOrEqual(2);
      expect(res.body.total).toBeGreaterThanOrEqual(3);
    });
  });

  describe('GET /api/memory/events/:id', () => {
    it('存在的 id 返回 200，含完整 event', async () => {
      const createRes = await request(app)
        .post('/api/memory/events')
        .send({
          eventType: 'user_message',
          scopeType: 'project',
          scopeId: 'demo',
          payload: { message: 'hello' }
        });
      expect(createRes.status).toBe(201);
      const id = createRes.body.id;

      const res = await request(app).get(`/api/memory/events/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(id);
      expect(res.body.eventType).toBe('user_message');
      expect(res.body.scopeType).toBe('project');
      expect(res.body.scopeId).toBe('demo');
    });

    it('不存在的 id 返回 404', async () => {
      const res = await request(app).get('/api/memory/events/nonexistent-id-12345');
      expect(res.status).toBe(404);
    });
  });
});

// ─── triggerCompress / handleCompressComplete / triggerPack / handlePackComplete 覆盖 ───

describe('Memory compress/pack pipeline coverage', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  let tmpDir;
  let store;
  let app;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-pipeline-'));
    const db = createDb();
    store = createStore(db);
    seedProject(store);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('triggerCompress 写入 episodes 和 facts，并触发 triggerPack', async () => {
    // mock runner：memory/compress 时写入 JSON 文件并调用 onComplete
    //              memory/pack 时写入 JSON 文件并调用 onComplete
    const mockRunner = {
      start: async (payload) => {
        const id = require('crypto').randomUUID();
        const now = new Date().toISOString();
        store.createRun({
          id,
          commandType: payload.commandType,
          targetName: payload.targetName || 'mock',
          status: 'running',
          prompt: '',
          logPath: '',
          startedAt: now
        });
        store.finishRun({ id, status: 'completed', exitCode: 0, errorMessage: null, finishedAt: now });
        const result = { id, commandType: payload.commandType, targetName: payload.targetName || 'mock', status: 'completed', exitCode: 0, startedAt: now, finishedAt: now };

        if (payload.commandType === 'memory' && payload.memoryPhase === 'compress') {
          // 写入 compress 输出文件
          const compressOutput = {
            episodes: [{ title: 'ep1', summary: 'summary1', eventIds: ['e1'], artifactPaths: [], conclusion: 'done', validFrom: now }],
            facts: [{ factType: 'delivery_fact', content: 'fact1', sourceEventIds: ['e1'], sourcePaths: [], confidence: 0.9, validFrom: now }]
          };
          fs.writeFileSync(payload.outputPath, JSON.stringify(compressOutput), 'utf8');
        }
        if (payload.commandType === 'memory' && payload.memoryPhase === 'pack') {
          // 写入 pack 输出文件
          const packOutput = { episodeIds: ['ep1'], factIds: ['f1'], summary: 'packed context' };
          fs.writeFileSync(payload.outputPath, JSON.stringify(packOutput), 'utf8');
        }

        if (typeof payload.onComplete === 'function') {
          payload.onComplete(result);
        }
        return result;
      }
    };

    app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing', claudeAssetsDir: tmpDir },
      store,
      indexer: { rebuild: () => ({ indexedProjects: 1, errors: [] }) },
      runner: mockRunner
    });

    // 触发 POST /api/memory/events，这会 setImmediate triggerCompress
    const res = await request(app).post('/api/memory/events').send({
      eventType: 'user_message',
      scopeType: 'project',
      scopeId: 'demo',
      payload: { message: 'trigger compress' }
    });
    expect(res.status).toBe(201);

    // 等待 setImmediate 执行
    await new Promise(resolve => setImmediate(resolve));
    // 再等一次，因为 handleCompressComplete 里还有一个 setImmediate
    await new Promise(resolve => setImmediate(resolve));

    // 验证 episodes 和 facts 被写入
    const episodes = store.listEpisodes({ scopeType: 'project', scopeId: 'demo', limit: 10, offset: 0 });
    expect(episodes.length).toBeGreaterThan(0);
    expect(episodes[0].title).toBe('ep1');

    const facts = store.listFacts({ scopeType: 'project', scopeId: 'demo', status: 'active', limit: 10, offset: 0 });
    expect(facts.length).toBeGreaterThan(0);
    expect(facts[0].content).toBe('fact1');

    // 验证 retrieval_pack 被写入（triggerPack 完成后）
    await new Promise(resolve => setImmediate(resolve));
    const pack = store.getLatestRetrievalPack('project', 'demo');
    expect(pack).toBeTruthy();
  });

  it('triggerCompress 跳过已有 running memory run', async () => {
    // 先插入一个 running memory run
    const runId = require('crypto').randomUUID();
    store.createRun({
      id: runId,
      commandType: 'memory',
      targetName: 'project/demo',
      status: 'running',
      prompt: '',
      logPath: '',
      startedAt: new Date().toISOString()
    });

    let startCalled = false;
    const mockRunner = {
      start: async (payload) => {
        if (payload.commandType === 'memory') startCalled = true;
        const id = require('crypto').randomUUID();
        const now = new Date().toISOString();
        store.createRun({ id, commandType: payload.commandType, targetName: payload.targetName || 'mock', status: 'running', prompt: '', logPath: '', startedAt: now });
        store.finishRun({ id, status: 'completed', exitCode: 0, errorMessage: null, finishedAt: now });
        const result = { id, status: 'completed', exitCode: 0, startedAt: now, finishedAt: now };
        if (typeof payload.onComplete === 'function') payload.onComplete(result);
        return result;
      }
    };

    app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing', claudeAssetsDir: tmpDir },
      store,
      indexer: { rebuild: () => ({ indexedProjects: 1, errors: [] }) },
      runner: mockRunner
    });

    await request(app).post('/api/memory/events').send({
      eventType: 'user_message',
      scopeType: 'project',
      scopeId: 'demo',
      payload: { msg: 'skip' }
    });

    await new Promise(resolve => setImmediate(resolve));
    expect(startCalled).toBe(false);
  });

  it('handleCompressComplete 在 result.status !== completed 时提前返回', async () => {
    const mockRunner = {
      start: async (payload) => {
        const id = require('crypto').randomUUID();
        const now = new Date().toISOString();
        store.createRun({ id, commandType: payload.commandType, targetName: payload.targetName || 'mock', status: 'running', prompt: '', logPath: '', startedAt: now });
        store.finishRun({ id, status: 'failed', exitCode: 1, errorMessage: 'err', finishedAt: now });
        const result = { id, status: 'failed', exitCode: 1, startedAt: now, finishedAt: now };
        if (typeof payload.onComplete === 'function') payload.onComplete(result);
        return result;
      }
    };

    app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing', claudeAssetsDir: tmpDir },
      store,
      indexer: { rebuild: () => ({ indexedProjects: 1, errors: [] }) },
      runner: mockRunner
    });

    await request(app).post('/api/memory/events').send({
      eventType: 'decision',
      scopeType: 'project',
      scopeId: 'demo',
      payload: { decision: 'test' }
    });

    await new Promise(resolve => setImmediate(resolve));
    // 没有 episodes 写入
    const episodes = store.listEpisodes({ scopeType: 'project', scopeId: 'demo', limit: 10, offset: 0 });
    expect(episodes.length).toBe(0);
  });

  it('handlePackComplete 在 result.status !== completed 时提前返回', async () => {
    const mockRunner = {
      start: async (payload) => {
        const id = require('crypto').randomUUID();
        const now = new Date().toISOString();
        store.createRun({ id, commandType: payload.commandType, targetName: payload.targetName || 'mock', status: 'running', prompt: '', logPath: '', startedAt: now });
        store.finishRun({ id, status: 'completed', exitCode: 0, errorMessage: null, finishedAt: now });
        const result = { id, status: 'completed', exitCode: 0, startedAt: now, finishedAt: now };

        if (payload.commandType === 'memory' && payload.memoryPhase === 'compress') {
          // compress 成功，写入文件
          const compressOutput = { episodes: [], facts: [] };
          fs.writeFileSync(payload.outputPath, JSON.stringify(compressOutput), 'utf8');
        }
        if (payload.commandType === 'memory' && payload.memoryPhase === 'pack') {
          // pack 失败（不写文件，让 readFileSync 抛出）
          // 不写文件
          const failResult = { ...result, status: 'failed' };
          if (typeof payload.onComplete === 'function') payload.onComplete(failResult);
          return failResult;
        }

        if (typeof payload.onComplete === 'function') payload.onComplete(result);
        return result;
      }
    };

    app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing', claudeAssetsDir: tmpDir },
      store,
      indexer: { rebuild: () => ({ indexedProjects: 1, errors: [] }) },
      runner: mockRunner
    });

    await request(app).post('/api/memory/events').send({
      eventType: 'user_message',
      scopeType: 'project',
      scopeId: 'demo',
      payload: { msg: 'pack fail test' }
    });

    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));

    // pack 失败，retrieval_pack 不应被写入
    const pack = store.getLatestRetrievalPack('project', 'demo');
    expect(pack).toBeNull();
  });
});

// ─── Episodes 只读 API ────────────────────────────────────────────────────────

describe('GET /api/memory/episodes', () => {
  let app;
  let store;

  beforeEach(() => {
    const db = createDb();
    store = createStore(db);
    app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing', claudeAssetsDir: 'missing' },
      store,
      indexer: { rebuild: () => ({ indexedProjects: 1, errors: [] }) },
      runner: null
    });
  });

  it('列出 episodes，返回 { episodes, total }', async () => {
    const now = new Date().toISOString();
    store.createEpisode({ id: 'ep-1', scopeType: 'project', scopeId: 'demo', title: 'Ep 1', summary: 's1', eventIds: '[]', artifactPaths: '[]', conclusion: '', generatedByRunId: null, validFrom: now });
    store.createEpisode({ id: 'ep-2', scopeType: 'project', scopeId: 'demo', title: 'Ep 2', summary: 's2', eventIds: '[]', artifactPaths: '[]', conclusion: '', generatedByRunId: null, validFrom: now });

    const res = await request(app).get('/api/memory/episodes?scopeType=project&scopeId=demo');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.episodes).toHaveLength(2);
  });

  it('GET /api/memory/episodes/:id 存在 → 200', async () => {
    const now = new Date().toISOString();
    store.createEpisode({ id: 'ep-get', scopeType: 'project', scopeId: 'demo', title: 'T', summary: 's', eventIds: '[]', artifactPaths: '[]', conclusion: '', generatedByRunId: null, validFrom: now });

    const res = await request(app).get('/api/memory/episodes/ep-get');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('ep-get');
  });

  it('GET /api/memory/episodes/:id 不存在 → 404', async () => {
    const res = await request(app).get('/api/memory/episodes/no-such-ep');
    expect(res.status).toBe(404);
  });
});

// ─── Facts 只读 API + reject ──────────────────────────────────────────────────

describe('GET /api/memory/facts', () => {
  let app;
  let store;

  beforeEach(() => {
    const db = createDb();
    store = createStore(db);
    app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing', claudeAssetsDir: 'missing' },
      store,
      indexer: { rebuild: () => ({ indexedProjects: 1, errors: [] }) },
      runner: null
    });
  });

  it('列出 facts，返回 { facts, total }', async () => {
    const now = new Date().toISOString();
    store.createFact({ id: 'f-1', factType: 'delivery_fact', scopeType: 'project', scopeId: 'demo', content: 'c1', sourceEventIds: '[]', sourcePaths: '[]', status: 'active', confidence: 1.0, validFrom: now, expiresAt: null, supersedesId: null, generatedByRunId: null });
    store.createFact({ id: 'f-2', factType: 'delivery_fact', scopeType: 'project', scopeId: 'demo', content: 'c2', sourceEventIds: '[]', sourcePaths: '[]', status: 'active', confidence: 1.0, validFrom: now, expiresAt: null, supersedesId: null, generatedByRunId: null });

    const res = await request(app).get('/api/memory/facts?scopeType=project&scopeId=demo');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.facts).toHaveLength(2);
  });

  it('GET /api/memory/facts?status=active → 只返回 active', async () => {
    const now = new Date().toISOString();
    store.createFact({ id: 'f-active', factType: 'delivery_fact', scopeType: 'project', scopeId: 'demo', content: 'active', sourceEventIds: '[]', sourcePaths: '[]', status: 'active', confidence: 1.0, validFrom: now, expiresAt: null, supersedesId: null, generatedByRunId: null });
    store.createFact({ id: 'f-rejected', factType: 'delivery_fact', scopeType: 'project', scopeId: 'demo', content: 'rejected', sourceEventIds: '[]', sourcePaths: '[]', status: 'rejected', confidence: 1.0, validFrom: now, expiresAt: null, supersedesId: null, generatedByRunId: null });

    const res = await request(app).get('/api/memory/facts?status=active');
    expect(res.status).toBe(200);
    expect(res.body.facts.every(f => f.status === 'active')).toBe(true);
  });

  it('GET /api/memory/facts/:id 存在 → 200', async () => {
    const now = new Date().toISOString();
    store.createFact({ id: 'f-get', factType: 'delivery_fact', scopeType: 'project', scopeId: 'demo', content: 'c', sourceEventIds: '[]', sourcePaths: '[]', status: 'active', confidence: 1.0, validFrom: now, expiresAt: null, supersedesId: null, generatedByRunId: null });

    const res = await request(app).get('/api/memory/facts/f-get');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('f-get');
  });

  it('GET /api/memory/facts/:id 不存在 → 404', async () => {
    const res = await request(app).get('/api/memory/facts/no-such-fact');
    expect(res.status).toBe(404);
  });

  it('PATCH /api/memory/facts/:id/reject → 200，status 变为 rejected', async () => {
    const now = new Date().toISOString();
    store.createFact({ id: 'f-rej', factType: 'delivery_fact', scopeType: 'project', scopeId: 'demo', content: 'c', sourceEventIds: '[]', sourcePaths: '[]', status: 'active', confidence: 1.0, validFrom: now, expiresAt: null, supersedesId: null, generatedByRunId: null });

    const res = await request(app).patch('/api/memory/facts/f-rej/reject');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
  });

  it('PATCH /api/memory/facts/:id/reject 不存在 → 404', async () => {
    const res = await request(app).patch('/api/memory/facts/no-such/reject');
    expect(res.status).toBe(404);
  });
});

// ─── Retrieval Packs 只读 API ─────────────────────────────────────────────────

describe('GET /api/memory/packs', () => {
  let app;
  let store;

  beforeEach(() => {
    const db = createDb();
    store = createStore(db);
    app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing', claudeAssetsDir: 'missing' },
      store,
      indexer: { rebuild: () => ({ indexedProjects: 1, errors: [] }) },
      runner: null
    });
  });

  it('GET /api/memory/packs/latest 有未过期 pack → 200', async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const now = new Date().toISOString();
    store.upsertRetrievalPack({ id: 'pack-1', scopeType: 'company', scopeId: 'default', runId: null, content: '{}', episodeIds: '[]', factIds: '[]', generatedAt: now, expiresAt: future });

    const res = await request(app).get('/api/memory/packs/latest?scopeType=company&scopeId=default');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('pack-1');
  });

  it('GET /api/memory/packs/latest 无 pack → 404', async () => {
    const res = await request(app).get('/api/memory/packs/latest?scopeType=company&scopeId=default');
    expect(res.status).toBe(404);
  });

  it('GET /api/memory/packs → 200，{ packs: [...] }', async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const now = new Date().toISOString();
    store.upsertRetrievalPack({ id: 'pack-list', scopeType: 'company', scopeId: 'default', runId: null, content: '{}', episodeIds: '[]', factIds: '[]', generatedAt: now, expiresAt: future });

    const res = await request(app).get('/api/memory/packs?scopeType=company&scopeId=default');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.packs)).toBe(true);
    expect(res.body.packs.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── 手动触发 compress ────────────────────────────────────────────────────────

describe('POST /api/memory/compress', () => {
  let store;

  beforeEach(() => {
    const db = createDb();
    store = createStore(db);
  });

  it('runner 为 mock → 202，{ message: "compress triggered" }', async () => {
    const mockRunner = { start: vi.fn().mockResolvedValue({}) };
    const app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing', claudeAssetsDir: 'missing' },
      store,
      indexer: { rebuild: () => ({ indexedProjects: 1, errors: [] }) },
      runner: mockRunner
    });

    const res = await request(app).post('/api/memory/compress').send({ scopeType: 'project', scopeId: 'demo' });
    expect(res.status).toBe(202);
    expect(res.body.message).toBe('compress triggered');
  });

  it('runner 为 null → 503', async () => {
    const app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing', claudeAssetsDir: 'missing' },
      store,
      indexer: { rebuild: () => ({ indexedProjects: 1, errors: [] }) },
      runner: null
    });

    const res = await request(app).post('/api/memory/compress').send({ scopeType: 'project', scopeId: 'demo' });
    expect(res.status).toBe(503);
  });

  it('缺少 scopeType → 400', async () => {
    const mockRunner = { start: vi.fn().mockResolvedValue({}) };
    const app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing', claudeAssetsDir: 'missing' },
      store,
      indexer: { rebuild: () => ({ indexedProjects: 1, errors: [] }) },
      runner: mockRunner
    });

    const res = await request(app).post('/api/memory/compress').send({ scopeId: 'demo' });
    expect(res.status).toBe(400);
  });

  it('缺少 scopeId → 400', async () => {
    const mockRunner = { start: vi.fn().mockResolvedValue({}) };
    const app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing', claudeAssetsDir: 'missing' },
      store,
      indexer: { rebuild: () => ({ indexedProjects: 1, errors: [] }) },
      runner: mockRunner
    });

    const res = await request(app).post('/api/memory/compress').send({ scopeType: 'project' });
    expect(res.status).toBe(400);
  });
});

// ─── Runner 注入 Retrieval Pack ───────────────────────────────────────────────

describe('POST /api/runs — Retrieval Pack 注入', () => {
  let store;
  let capturedPrompt;
  let mockRunner;

  beforeEach(() => {
    const db = createDb();
    store = createStore(db);
    capturedPrompt = null;
    mockRunner = {
      start: vi.fn().mockImplementation(async (payload) => {
        capturedPrompt = payload.prompt || null;
        return { id: 'run-inject-1', status: 'running' };
      })
    };
  });

  it('有未过期 Pack → runner.start 的 prompt 包含 Pack content', async () => {
    const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const packContent = JSON.stringify({ taskGoal: '测试目标', activeFacts: [] });
    store.upsertRetrievalPack({
      id: 'pack-inject-1',
      scopeType: 'company',
      scopeId: 'default',
      runId: null,
      content: packContent,
      episodeIds: '[]',
      factIds: '[]',
      generatedAt: now,
      expiresAt: future
    });

    const app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing', claudeAssetsDir: 'missing' },
      store,
      indexer: { rebuild: () => ({ indexedProjects: 1, errors: [] }) },
      runner: mockRunner
    });

    const res = await request(app).post('/api/runs').send({ commandType: 'intake', targetName: 'demo' });
    expect(res.status).toBe(202);
    expect(mockRunner.start).toHaveBeenCalled();
    expect(capturedPrompt).toContain('测试目标');
  });

  it('无 Pack → runner.start 正常调用，prompt 不含 Pack 内容', async () => {
    const app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing', claudeAssetsDir: 'missing' },
      store,
      indexer: { rebuild: () => ({ indexedProjects: 1, errors: [] }) },
      runner: mockRunner
    });

    const res = await request(app).post('/api/runs').send({ commandType: 'intake', targetName: 'demo' });
    expect(res.status).toBe(202);
    expect(mockRunner.start).toHaveBeenCalled();
    expect(capturedPrompt == null || !capturedPrompt.includes('Retrieval Pack')).toBe(true);
  });

  it('Pack 已过期 → runner.start 正常调用，prompt 不含 Pack 内容', async () => {
    const past = '2000-01-01T00:00:00.000Z';
    const now = new Date().toISOString();
    const packContent = JSON.stringify({ taskGoal: '过期目标', activeFacts: [] });
    store.upsertRetrievalPack({
      id: 'pack-expired-1',
      scopeType: 'company',
      scopeId: 'default',
      runId: null,
      content: packContent,
      episodeIds: '[]',
      factIds: '[]',
      generatedAt: now,
      expiresAt: past
    });

    const app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing', claudeAssetsDir: 'missing' },
      store,
      indexer: { rebuild: () => ({ indexedProjects: 1, errors: [] }) },
      runner: mockRunner
    });

    const res = await request(app).post('/api/runs').send({ commandType: 'intake', targetName: 'demo' });
    expect(res.status).toBe(202);
    expect(mockRunner.start).toHaveBeenCalled();
    expect(capturedPrompt == null || !capturedPrompt.includes('过期目标')).toBe(true);
  });
});
