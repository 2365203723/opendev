const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/db');

let tmpDir;
let db;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-plane-db-phase3-'));
  db = openDatabase(path.join(tmpDir, 'control-plane.db'));
});

afterEach(() => {
  if (db) db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Phase 3 SQLite schema', () => {
  it('raw_events 表存在且含所有必填字段', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map(row => row.name);
    expect(tables).toContain('raw_events');

    const cols = db
      .prepare('PRAGMA table_info(raw_events)')
      .all()
      .map(c => c.name);

    const required = [
      'id', 'event_type', 'scope_type', 'scope_id',
      'payload', 'source', 'occurred_at', 'created_at'
    ];
    for (const field of required) {
      expect(cols).toContain(field);
    }
  });

  it('episodes 表存在且含所有必填字段', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map(row => row.name);
    expect(tables).toContain('episodes');

    const cols = db
      .prepare('PRAGMA table_info(episodes)')
      .all()
      .map(c => c.name);

    const required = [
      'id', 'scope_type', 'scope_id', 'title', 'summary',
      'event_ids', 'artifact_paths', 'conclusion',
      'generated_by_run_id', 'valid_from', 'created_at'
    ];
    for (const field of required) {
      expect(cols).toContain(field);
    }
  });

  it('facts 表存在且含所有必填字段', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map(row => row.name);
    expect(tables).toContain('facts');

    const cols = db
      .prepare('PRAGMA table_info(facts)')
      .all()
      .map(c => c.name);

    const required = [
      'id', 'fact_type', 'scope_type', 'scope_id', 'content',
      'source_event_ids', 'source_paths', 'confidence',
      'valid_from', 'expires_at', 'supersedes_id', 'status',
      'generated_by_run_id', 'created_at'
    ];
    for (const field of required) {
      expect(cols).toContain(field);
    }
  });

  it('retrieval_packs 表存在且含所有必填字段', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map(row => row.name);
    expect(tables).toContain('retrieval_packs');

    const cols = db
      .prepare('PRAGMA table_info(retrieval_packs)')
      .all()
      .map(c => c.name);

    const required = [
      'id', 'scope_type', 'scope_id', 'run_id', 'content',
      'episode_ids', 'fact_ids', 'generated_at', 'expires_at', 'created_at'
    ];
    for (const field of required) {
      expect(cols).toContain(field);
    }
  });

  it('facts 自引用外键：删除 fact A 后 fact B 的 supersedes_id 变为 NULL（ON DELETE SET NULL）', () => {
    db.pragma('foreign_keys = ON');

    const insertFact = db.prepare(
      `INSERT INTO facts
        (id, fact_type, scope_type, scope_id, content, source_event_ids, source_paths, valid_from)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    // 插入 fact A
    insertFact.run(
      'fact-a', 'observation', 'project', 'proj-1',
      '内容A', '[]', '[]', '2026-05-22T00:00:00.000Z'
    );

    // 插入 fact B，supersedes_id 指向 A
    insertFact.run(
      'fact-b', 'observation', 'project', 'proj-1',
      '内容B', '[]', '[]', '2026-05-22T01:00:00.000Z'
    );
    db.prepare("UPDATE facts SET supersedes_id = 'fact-a' WHERE id = 'fact-b'").run();

    // 确认 B 的 supersedes_id 已设置
    const beforeDelete = db.prepare("SELECT supersedes_id FROM facts WHERE id = 'fact-b'").get();
    expect(beforeDelete.supersedes_id).toBe('fact-a');

    // 删除 fact A
    db.prepare("DELETE FROM facts WHERE id = 'fact-a'").run();

    // B 的 supersedes_id 应变为 NULL
    const afterDelete = db.prepare("SELECT supersedes_id FROM facts WHERE id = 'fact-b'").get();
    expect(afterDelete.supersedes_id).toBeNull();
  });
});
