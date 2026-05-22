const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/db');

let tmpDir;
let db;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-plane-db-phase2-'));
  db = openDatabase(path.join(tmpDir, 'control-plane.db'));
});

afterEach(() => {
  if (db) db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Phase 2 SQLite schema', () => {
  it('change_requests 表存在且含所有必填字段', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map(row => row.name);
    expect(tables).toContain('change_requests');

    const cols = db
      .prepare("PRAGMA table_info(change_requests)")
      .all()
      .map(c => c.name);

    const required = [
      'id', 'project_name', 'title', 'source', 'scope',
      'current_behavior', 'expected_behavior', 'acceptance_criteria',
      'priority', 'status', 'ia_run_id', 'patch_run_id',
      'regression_run_id', 'created_at', 'updated_at'
    ];
    for (const field of required) {
      expect(cols).toContain(field);
    }
  });

  it('change_requests 外键约束 project_name → projects.name ON DELETE CASCADE', () => {
    const fkList = db
      .prepare("PRAGMA foreign_key_list(change_requests)")
      .all();
    const fk = fkList.find(f => f.from === 'project_name');
    expect(fk).toBeDefined();
    expect(fk.table).toBe('projects');
    expect(fk.to).toBe('name');
    expect(fk.on_delete.toUpperCase()).toBe('CASCADE');
  });

  it('cr_documents 表存在且有 UNIQUE(cr_id, doc_type)', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map(row => row.name);
    expect(tables).toContain('cr_documents');

    // 验证 UNIQUE 约束存在（通过 index_list）
    const indexes = db
      .prepare("PRAGMA index_list(cr_documents)")
      .all();
    const uniqueIdx = indexes.find(i => i.unique === 1);
    expect(uniqueIdx).toBeDefined();

    const idxCols = db
      .prepare(`PRAGMA index_info(${uniqueIdx.name})`)
      .all()
      .map(c => c.name);
    expect(idxCols).toContain('cr_id');
    expect(idxCols).toContain('doc_type');
  });

  it('cr_documents 外键约束 cr_id → change_requests.id ON DELETE CASCADE', () => {
    const fkList = db
      .prepare("PRAGMA foreign_key_list(cr_documents)")
      .all();
    const fk = fkList.find(f => f.from === 'cr_id');
    expect(fk).toBeDefined();
    expect(fk.table).toBe('change_requests');
    expect(fk.to).toBe('id');
    expect(fk.on_delete.toUpperCase()).toBe('CASCADE');
  });

  it('regression_results 表存在', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map(row => row.name);
    expect(tables).toContain('regression_results');
  });

  it('regression_results 外键约束 cr_id → change_requests.id ON DELETE CASCADE', () => {
    const fkList = db
      .prepare("PRAGMA foreign_key_list(regression_results)")
      .all();
    const fk = fkList.find(f => f.from === 'cr_id');
    expect(fk).toBeDefined();
    expect(fk.table).toBe('change_requests');
    expect(fk.to).toBe('id');
    expect(fk.on_delete.toUpperCase()).toBe('CASCADE');
  });

  it('删除 project 后 CR 被级联删除', () => {
    db.pragma('foreign_keys = ON');

    db.prepare(
      "INSERT INTO projects (name, root_path, phase, updated_at) VALUES (?, ?, ?, ?)"
    ).run('proj-cascade', 'E:/projects/proj-cascade', 'build', '2026-05-23T00:00:00.000Z');

    db.prepare(
      `INSERT INTO change_requests
        (id, project_name, title, source, scope, current_behavior, expected_behavior, acceptance_criteria, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'cr-001', 'proj-cascade', '测试 CR', 'user_input', 'project',
      '当前行为', '期望行为', '["验收标准1"]',
      '2026-05-23T00:00:00.000Z', '2026-05-23T00:00:00.000Z'
    );

    const beforeDelete = db
      .prepare("SELECT id FROM change_requests WHERE id = 'cr-001'")
      .get();
    expect(beforeDelete).toBeDefined();

    db.prepare("DELETE FROM projects WHERE name = 'proj-cascade'").run();

    const afterDelete = db
      .prepare("SELECT id FROM change_requests WHERE id = 'cr-001'")
      .get();
    expect(afterDelete).toBeUndefined();
  });

  it('同一 (cr_id, doc_type) 重复插入 cr_documents 抛 UNIQUE 冲突', () => {
    db.pragma('foreign_keys = ON');

    db.prepare(
      "INSERT INTO projects (name, root_path, phase, updated_at) VALUES (?, ?, ?, ?)"
    ).run('proj-unique', 'E:/projects/proj-unique', 'build', '2026-05-23T00:00:00.000Z');

    db.prepare(
      `INSERT INTO change_requests
        (id, project_name, title, source, scope, current_behavior, expected_behavior, acceptance_criteria, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'cr-002', 'proj-unique', '测试 CR 2', 'user_input', 'project',
      '当前行为', '期望行为', '["验收标准1"]',
      '2026-05-23T00:00:00.000Z', '2026-05-23T00:00:00.000Z'
    );

    const insertDoc = db.prepare(
      `INSERT INTO cr_documents (cr_id, doc_type, path, content_summary)
       VALUES (?, ?, ?, ?)`
    );

    insertDoc.run('cr-002', 'impact_analysis', '/path/to/doc.md', '摘要');

    expect(() => {
      insertDoc.run('cr-002', 'impact_analysis', '/path/to/doc2.md', '摘要2');
    }).toThrow();
  });
});
