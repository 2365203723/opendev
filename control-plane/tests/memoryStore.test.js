const Database = require('better-sqlite3');
const { createStore } = require('../src/store');

function makeDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
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
    CREATE TABLE IF NOT EXISTS change_requests (
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
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_name) REFERENCES projects(name) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS cr_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cr_id TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      path TEXT NOT NULL,
      content_summary TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (cr_id) REFERENCES change_requests(id) ON DELETE CASCADE,
      UNIQUE(cr_id, doc_type)
    );
    CREATE TABLE IF NOT EXISTS regression_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cr_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      status TEXT NOT NULL,
      total_tests INTEGER,
      passed_tests INTEGER,
      failed_tests INTEGER,
      report_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (cr_id) REFERENCES change_requests(id) ON DELETE CASCADE
    );
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
      FOREIGN KEY (supersedes_id) REFERENCES facts(id) ON DELETE SET NULL
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
  `);
  return db;
}

let db, store;

beforeEach(() => {
  db = makeDb();
  store = createStore(db);
});

afterEach(() => {
  if (db) db.close();
});

// ─── raw_events ───────────────────────────────────────────────────────────────

describe('createRawEvent / getRawEvent', () => {
  const event = {
    id: 'evt-001',
    eventType: 'task_completed',
    scopeType: 'project',
    scopeId: 'proj-1',
    payload: '{"result":"ok"}',
    source: 'agent',
    occurredAt: '2026-05-22T10:00:00.000Z'
  };

  it('插入后 getRawEvent 返回所有 camelCase 字段', () => {
    store.createRawEvent(event);
    const r = store.getRawEvent('evt-001');
    expect(r.id).toBe('evt-001');
    expect(r.eventType).toBe('task_completed');
    expect(r.scopeType).toBe('project');
    expect(r.scopeId).toBe('proj-1');
    expect(r.payload).toBe('{"result":"ok"}');
    expect(r.source).toBe('agent');
    expect(r.occurredAt).toBe('2026-05-22T10:00:00.000Z');
    expect(typeof r.createdAt).toBe('string');
  });

  it('payload 存储为 JSON 字符串，读回时仍为字符串（不自动解析）', () => {
    store.createRawEvent(event);
    const r = store.getRawEvent('evt-001');
    expect(typeof r.payload).toBe('string');
    expect(r.payload).toBe('{"result":"ok"}');
  });

  it('getRawEvent 不存在时返回 null', () => {
    expect(store.getRawEvent('nonexistent')).toBeNull();
  });
});

describe('listRawEvents', () => {
  beforeEach(() => {
    store.createRawEvent({
      id: 'evt-001', eventType: 'type_a', scopeType: 'project', scopeId: 'proj-1',
      payload: '{}', source: 'agent', occurredAt: '2026-05-22T08:00:00.000Z'
    });
    store.createRawEvent({
      id: 'evt-002', eventType: 'type_b', scopeType: 'project', scopeId: 'proj-1',
      payload: '{}', source: 'agent', occurredAt: '2026-05-22T09:00:00.000Z'
    });
    store.createRawEvent({
      id: 'evt-003', eventType: 'type_a', scopeType: 'project', scopeId: 'proj-2',
      payload: '{}', source: 'agent', occurredAt: '2026-05-22T10:00:00.000Z'
    });
    store.createRawEvent({
      id: 'evt-004', eventType: 'type_a', scopeType: 'global', scopeId: 'global',
      payload: '{}', source: 'system', occurredAt: '2026-05-22T11:00:00.000Z'
    });
  });

  it('不传过滤条件时返回全部，按 occurred_at DESC', () => {
    const rows = store.listRawEvents({});
    expect(rows.map(r => r.id)).toEqual(['evt-004', 'evt-003', 'evt-002', 'evt-001']);
  });

  it('按 scopeType + scopeId 过滤', () => {
    const rows = store.listRawEvents({ scopeType: 'project', scopeId: 'proj-1' });
    expect(rows.map(r => r.id)).toEqual(['evt-002', 'evt-001']);
  });

  it('按 eventType 过滤', () => {
    const rows = store.listRawEvents({ eventType: 'type_a' });
    expect(rows.map(r => r.id)).toEqual(['evt-004', 'evt-003', 'evt-001']);
  });

  it('按 scopeType + scopeId + eventType 组合过滤', () => {
    const rows = store.listRawEvents({ scopeType: 'project', scopeId: 'proj-1', eventType: 'type_a' });
    expect(rows.map(r => r.id)).toEqual(['evt-001']);
  });

  it('limit 限制返回数量', () => {
    const rows = store.listRawEvents({ limit: 2 });
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe('evt-004');
  });

  it('offset 跳过前 N 条', () => {
    const rows = store.listRawEvents({ limit: 2, offset: 2 });
    expect(rows.map(r => r.id)).toEqual(['evt-002', 'evt-001']);
  });

  it('无匹配时返回空数组', () => {
    const rows = store.listRawEvents({ scopeType: 'nonexistent' });
    expect(rows).toEqual([]);
  });
});

// ─── episodes ─────────────────────────────────────────────────────────────────

describe('createEpisode / getEpisode', () => {
  const episode = {
    id: 'ep-001',
    scopeType: 'project',
    scopeId: 'proj-1',
    title: '第一个 episode',
    summary: '摘要内容',
    eventIds: '["evt-001","evt-002"]',
    artifactPaths: '["/path/a.md"]',
    conclusion: '结论文本',
    generatedByRunId: 'run-001',
    validFrom: '2026-05-22T10:00:00.000Z'
  };

  it('插入后 getEpisode 返回所有 camelCase 字段', () => {
    store.createEpisode(episode);
    const r = store.getEpisode('ep-001');
    expect(r.id).toBe('ep-001');
    expect(r.scopeType).toBe('project');
    expect(r.scopeId).toBe('proj-1');
    expect(r.title).toBe('第一个 episode');
    expect(r.summary).toBe('摘要内容');
    expect(r.eventIds).toBe('["evt-001","evt-002"]');
    expect(r.artifactPaths).toBe('["/path/a.md"]');
    expect(r.conclusion).toBe('结论文本');
    expect(r.generatedByRunId).toBe('run-001');
    expect(r.validFrom).toBe('2026-05-22T10:00:00.000Z');
    expect(typeof r.createdAt).toBe('string');
  });

  it('eventIds/artifactPaths 存储为 JSON 字符串，读回仍为字符串', () => {
    store.createEpisode(episode);
    const r = store.getEpisode('ep-001');
    expect(typeof r.eventIds).toBe('string');
    expect(typeof r.artifactPaths).toBe('string');
  });

  it('generatedByRunId 可为 null', () => {
    store.createEpisode({ ...episode, id: 'ep-002', generatedByRunId: null });
    const r = store.getEpisode('ep-002');
    expect(r.generatedByRunId).toBeNull();
  });

  it('getEpisode 不存在时返回 null', () => {
    expect(store.getEpisode('nonexistent')).toBeNull();
  });
});

describe('listEpisodes', () => {
  beforeEach(() => {
    store.createEpisode({
      id: 'ep-001', scopeType: 'project', scopeId: 'proj-1',
      title: 'ep1', summary: 's', eventIds: '[]', artifactPaths: '[]',
      conclusion: 'c', generatedByRunId: null, validFrom: '2026-05-22T08:00:00.000Z'
    });
    store.createEpisode({
      id: 'ep-002', scopeType: 'project', scopeId: 'proj-1',
      title: 'ep2', summary: 's', eventIds: '[]', artifactPaths: '[]',
      conclusion: 'c', generatedByRunId: null, validFrom: '2026-05-22T09:00:00.000Z'
    });
    store.createEpisode({
      id: 'ep-003', scopeType: 'project', scopeId: 'proj-2',
      title: 'ep3', summary: 's', eventIds: '[]', artifactPaths: '[]',
      conclusion: 'c', generatedByRunId: null, validFrom: '2026-05-22T10:00:00.000Z'
    });
  });

  it('按 scopeType + scopeId 过滤，按 valid_from DESC', () => {
    const rows = store.listEpisodes({ scopeType: 'project', scopeId: 'proj-1' });
    expect(rows.map(r => r.id)).toEqual(['ep-002', 'ep-001']);
  });

  it('limit 限制返回数量', () => {
    const rows = store.listEpisodes({ scopeType: 'project', scopeId: 'proj-1', limit: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('ep-002');
  });

  it('offset 跳过前 N 条', () => {
    const rows = store.listEpisodes({ scopeType: 'project', scopeId: 'proj-1', offset: 1 });
    expect(rows.map(r => r.id)).toEqual(['ep-001']);
  });

  it('无匹配时返回空数组', () => {
    const rows = store.listEpisodes({ scopeType: 'project', scopeId: 'nonexistent' });
    expect(rows).toEqual([]);
  });
});

// ─── facts ────────────────────────────────────────────────────────────────────

describe('createFact / getFact', () => {
  const fact = {
    id: 'fact-001',
    factType: 'observation',
    scopeType: 'project',
    scopeId: 'proj-1',
    content: '观察内容',
    sourceEventIds: '["evt-001"]',
    sourcePaths: '["/path/a.md"]',
    confidence: 0.9,
    validFrom: '2026-05-22T10:00:00.000Z',
    expiresAt: '2026-06-22T10:00:00.000Z',
    supersedesId: null,
    status: 'active',
    generatedByRunId: 'run-001'
  };

  it('插入后 getFact 返回所有 camelCase 字段', () => {
    store.createFact(fact);
    const r = store.getFact('fact-001');
    expect(r.id).toBe('fact-001');
    expect(r.factType).toBe('observation');
    expect(r.scopeType).toBe('project');
    expect(r.scopeId).toBe('proj-1');
    expect(r.content).toBe('观察内容');
    expect(r.sourceEventIds).toBe('["evt-001"]');
    expect(r.sourcePaths).toBe('["/path/a.md"]');
    expect(r.confidence).toBe(0.9);
    expect(r.validFrom).toBe('2026-05-22T10:00:00.000Z');
    expect(r.expiresAt).toBe('2026-06-22T10:00:00.000Z');
    expect(r.supersedesId).toBeNull();
    expect(r.status).toBe('active');
    expect(r.generatedByRunId).toBe('run-001');
    expect(typeof r.createdAt).toBe('string');
  });

  it('expiresAt 可为 null', () => {
    store.createFact({ ...fact, id: 'fact-002', expiresAt: null });
    const r = store.getFact('fact-002');
    expect(r.expiresAt).toBeNull();
  });

  it('getFact 不存在时返回 null', () => {
    expect(store.getFact('nonexistent')).toBeNull();
  });
});

describe('listFacts', () => {
  beforeEach(() => {
    store.createFact({
      id: 'fact-001', factType: 'obs', scopeType: 'project', scopeId: 'proj-1',
      content: 'c1', sourceEventIds: '[]', sourcePaths: '[]', confidence: 1.0,
      validFrom: '2026-05-22T08:00:00.000Z', expiresAt: null, supersedesId: null,
      status: 'active', generatedByRunId: null
    });
    store.createFact({
      id: 'fact-002', factType: 'obs', scopeType: 'project', scopeId: 'proj-1',
      content: 'c2', sourceEventIds: '[]', sourcePaths: '[]', confidence: 1.0,
      validFrom: '2026-05-22T09:00:00.000Z', expiresAt: null, supersedesId: null,
      status: 'superseded', generatedByRunId: null
    });
    store.createFact({
      id: 'fact-003', factType: 'obs', scopeType: 'project', scopeId: 'proj-2',
      content: 'c3', sourceEventIds: '[]', sourcePaths: '[]', confidence: 1.0,
      validFrom: '2026-05-22T10:00:00.000Z', expiresAt: null, supersedesId: null,
      status: 'active', generatedByRunId: null
    });
  });

  it('按 scopeType + scopeId 过滤，按 valid_from DESC', () => {
    const rows = store.listFacts({ scopeType: 'project', scopeId: 'proj-1' });
    expect(rows.map(r => r.id)).toEqual(['fact-002', 'fact-001']);
  });

  it('按 status 过滤', () => {
    const rows = store.listFacts({ scopeType: 'project', scopeId: 'proj-1', status: 'active' });
    expect(rows.map(r => r.id)).toEqual(['fact-001']);
  });

  it('不传 status 时返回全部', () => {
    const rows = store.listFacts({ scopeType: 'project', scopeId: 'proj-1' });
    expect(rows).toHaveLength(2);
  });

  it('limit 限制返回数量', () => {
    const rows = store.listFacts({ scopeType: 'project', scopeId: 'proj-1', limit: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('fact-002');
  });

  it('offset 跳过前 N 条', () => {
    const rows = store.listFacts({ scopeType: 'project', scopeId: 'proj-1', offset: 1 });
    expect(rows.map(r => r.id)).toEqual(['fact-001']);
  });

  it('无匹配时返回空数组', () => {
    const rows = store.listFacts({ scopeType: 'project', scopeId: 'nonexistent' });
    expect(rows).toEqual([]);
  });
});

describe('updateFactStatus', () => {
  beforeEach(() => {
    store.createFact({
      id: 'fact-001', factType: 'obs', scopeType: 'project', scopeId: 'proj-1',
      content: 'c', sourceEventIds: '[]', sourcePaths: '[]', confidence: 1.0,
      validFrom: '2026-05-22T10:00:00.000Z', expiresAt: null, supersedesId: null,
      status: 'active', generatedByRunId: null
    });
  });

  it('更新 status 并返回更新后的 fact', () => {
    const updated = store.updateFactStatus('fact-001', 'superseded');
    expect(updated.status).toBe('superseded');
    expect(updated.id).toBe('fact-001');
  });

  it('getFact 读回时 status 已更新', () => {
    store.updateFactStatus('fact-001', 'expired');
    const r = store.getFact('fact-001');
    expect(r.status).toBe('expired');
  });
});

// ─── retrieval_packs ──────────────────────────────────────────────────────────

describe('upsertRetrievalPack / getRetrievalPack', () => {
  const pack = {
    id: 'pack-001',
    scopeType: 'project',
    scopeId: 'proj-1',
    runId: 'run-001',
    content: '检索内容',
    episodeIds: '["ep-001"]',
    factIds: '["fact-001"]',
    generatedAt: '2026-05-22T10:00:00.000Z',
    expiresAt: '2026-05-23T10:00:00.000Z'
  };

  it('插入后 getRetrievalPack 返回所有 camelCase 字段', () => {
    store.upsertRetrievalPack(pack);
    const r = store.getRetrievalPack('pack-001');
    expect(r.id).toBe('pack-001');
    expect(r.scopeType).toBe('project');
    expect(r.scopeId).toBe('proj-1');
    expect(r.runId).toBe('run-001');
    expect(r.content).toBe('检索内容');
    expect(r.episodeIds).toBe('["ep-001"]');
    expect(r.factIds).toBe('["fact-001"]');
    expect(r.generatedAt).toBe('2026-05-22T10:00:00.000Z');
    expect(r.expiresAt).toBe('2026-05-23T10:00:00.000Z');
    expect(typeof r.createdAt).toBe('string');
  });

  it('INSERT OR REPLACE：相同 id 再次 upsert 会覆盖', () => {
    store.upsertRetrievalPack(pack);
    store.upsertRetrievalPack({ ...pack, content: '更新内容' });
    const r = store.getRetrievalPack('pack-001');
    expect(r.content).toBe('更新内容');
  });

  it('getRetrievalPack 不存在时返回 null', () => {
    expect(store.getRetrievalPack('nonexistent')).toBeNull();
  });
});

describe('getLatestRetrievalPack', () => {
  it('返回最新未过期 Pack', () => {
    // 未过期：expires_at 设为未来
    store.upsertRetrievalPack({
      id: 'pack-001', scopeType: 'project', scopeId: 'proj-1', runId: 'run-001',
      content: 'old', episodeIds: '[]', factIds: '[]',
      generatedAt: '2026-05-22T08:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z'
    });
    store.upsertRetrievalPack({
      id: 'pack-002', scopeType: 'project', scopeId: 'proj-1', runId: 'run-002',
      content: 'new', episodeIds: '[]', factIds: '[]',
      generatedAt: '2026-05-22T09:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z'
    });
    const r = store.getLatestRetrievalPack('project', 'proj-1');
    expect(r.id).toBe('pack-002');
  });

  it('已过期的 Pack 不返回', () => {
    store.upsertRetrievalPack({
      id: 'pack-expired', scopeType: 'project', scopeId: 'proj-1', runId: 'run-001',
      content: 'expired', episodeIds: '[]', factIds: '[]',
      generatedAt: '2020-01-01T00:00:00.000Z',
      expiresAt: '2020-01-02T00:00:00.000Z'
    });
    const r = store.getLatestRetrievalPack('project', 'proj-1');
    expect(r).toBeNull();
  });

  it('不存在时返回 null', () => {
    expect(store.getLatestRetrievalPack('project', 'nonexistent')).toBeNull();
  });
});

describe('listRetrievalPacks', () => {
  beforeEach(() => {
    store.upsertRetrievalPack({
      id: 'pack-001', scopeType: 'project', scopeId: 'proj-1', runId: 'run-001',
      content: 'c1', episodeIds: '[]', factIds: '[]',
      generatedAt: '2026-05-22T08:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z'
    });
    store.upsertRetrievalPack({
      id: 'pack-002', scopeType: 'project', scopeId: 'proj-1', runId: 'run-002',
      content: 'c2', episodeIds: '[]', factIds: '[]',
      generatedAt: '2026-05-22T09:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z'
    });
    store.upsertRetrievalPack({
      id: 'pack-003', scopeType: 'project', scopeId: 'proj-2', runId: 'run-003',
      content: 'c3', episodeIds: '[]', factIds: '[]',
      generatedAt: '2026-05-22T10:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z'
    });
  });

  it('按 scopeType + scopeId 过滤，按 generated_at DESC', () => {
    const rows = store.listRetrievalPacks('project', 'proj-1');
    expect(rows.map(r => r.id)).toEqual(['pack-002', 'pack-001']);
  });

  it('limit 限制返回数量', () => {
    const rows = store.listRetrievalPacks('project', 'proj-1', 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('pack-002');
  });

  it('无匹配时返回空数组', () => {
    const rows = store.listRetrievalPacks('project', 'nonexistent');
    expect(rows).toEqual([]);
  });
});
