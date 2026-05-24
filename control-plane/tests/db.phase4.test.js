const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');
const { openDatabase } = require('../src/db');

let testDbPath;
let db;

beforeEach(() => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-phase4-test-'));
  testDbPath = path.join(tmpDir, 'test.db');
});

afterEach(() => {
  if (db) {
    db.close();
    db = null;
  }
  if (testDbPath && fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
    fs.rmdirSync(path.dirname(testDbPath));
  }
});

describe('Phase 4 Schema', () => {

  it('创建四层表结构', () => {
    db = openDatabase(testDbPath);

    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table'
    `).all().map(row => row.name);

    expect(tables).toContain('products');
    expect(tables).toContain('milestones');
    expect(tables).toContain('workstreams');
    expect(tables).toContain('tasks');
  });

  it('products 表结构正确', () => {
    db = openDatabase(testDbPath);

    const columns = db.prepare(`PRAGMA table_info(products)`).all();
    const columnNames = columns.map(col => col.name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('name');
    expect(columnNames).toContain('client_name');
    expect(columnNames).toContain('root_path');
    expect(columnNames).toContain('status');
    expect(columnNames).toContain('created_at');
    expect(columnNames).toContain('updated_at');
  });

  it('milestones 表有 product_id 外键', () => {
    db = openDatabase(testDbPath);

    const foreignKeys = db.prepare(`PRAGMA foreign_key_list(milestones)`).all();
    const productFk = foreignKeys.find(fk => fk.table === 'products');

    expect(productFk).toBeDefined();
    expect(productFk.from).toBe('product_id');
    expect(productFk.on_delete).toBe('CASCADE');
  });

  it('workstreams 表有 milestone_id 和 project_name 外键', () => {
    db = openDatabase(testDbPath);

    const foreignKeys = db.prepare(`PRAGMA foreign_key_list(workstreams)`).all();
    const milestoneFk = foreignKeys.find(fk => fk.table === 'milestones');
    const projectFk = foreignKeys.find(fk => fk.table === 'projects');

    expect(milestoneFk).toBeDefined();
    expect(milestoneFk.from).toBe('milestone_id');
    expect(milestoneFk.on_delete).toBe('CASCADE');

    expect(projectFk).toBeDefined();
    expect(projectFk.from).toBe('project_name');
    expect(projectFk.on_delete).toBe('SET NULL');
  });

  it('tasks 表有 workstream_id 外键', () => {
    db = openDatabase(testDbPath);

    const foreignKeys = db.prepare(`PRAGMA foreign_key_list(tasks)`).all();
    const workstreamFk = foreignKeys.find(fk => fk.table === 'workstreams');

    expect(workstreamFk).toBeDefined();
    expect(workstreamFk.from).toBe('workstream_id');
    expect(workstreamFk.on_delete).toBe('CASCADE');
  });

  it('gates 表使用新 schema (scope_type/scope_id)', () => {
    db = openDatabase(testDbPath);

    const columns = db.prepare(`PRAGMA table_info(gates)`).all();
    const columnNames = columns.map(col => col.name);

    expect(columnNames).toContain('scope_type');
    expect(columnNames).toContain('scope_id');
    expect(columnNames).toContain('gate_name');
    expect(columnNames).not.toContain('project_name');
    expect(columnNames).not.toContain('name');
  });

  it('级联删除：删除 product 时清理所有子记录', () => {
    db = openDatabase(testDbPath);

    // 插入测试数据
    db.prepare(`INSERT INTO products (id, name, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)`).run('p1', 'Test Product', 'active', '2026-05-23', '2026-05-23');

    db.prepare(`INSERT INTO milestones (id, product_id, name, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run('m1', 'p1', 'Milestone 1', 'planned', '2026-05-23', '2026-05-23');

    db.prepare(`INSERT INTO workstreams (id, milestone_id, name, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run('w1', 'm1', 'Workstream 1', 'todo', '2026-05-23', '2026-05-23');

    db.prepare(`INSERT INTO tasks (id, workstream_id, title, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run('t1', 'w1', 'Task 1', 'backlog', '2026-05-23', '2026-05-23');

    // 删除 product
    db.prepare(`DELETE FROM products WHERE id = ?`).run('p1');

    // 验证级联删除
    const milestones = db.prepare(`SELECT * FROM milestones WHERE id = ?`).all('m1');
    const workstreams = db.prepare(`SELECT * FROM workstreams WHERE id = ?`).all('w1');
    const tasks = db.prepare(`SELECT * FROM tasks WHERE id = ?`).all('t1');

    expect(milestones).toHaveLength(0);
    expect(workstreams).toHaveLength(0);
    expect(tasks).toHaveLength(0);
  });
});

describe('Gates Table Migration', () => {
  beforeEach(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-migration-test-'));
    testDbPath = path.join(tmpDir, 'test.db');
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
    if (testDbPath && fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
      fs.rmdirSync(path.dirname(testDbPath));
    }
  });

  it('迁移旧 gates 表到新 schema', () => {
    // 创建旧 schema
    db = new Database(testDbPath);
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE projects (
        name TEXT PRIMARY KEY,
        root_path TEXT NOT NULL,
        phase TEXT NOT NULL,
        complexity TEXT,
        reopen_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE gates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        evidence_path TEXT,
        checked_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (project_name) REFERENCES projects(name) ON DELETE CASCADE,
        UNIQUE(project_name, name)
      );
    `);

    // 插入旧数据
    db.prepare(`INSERT INTO projects (name, root_path, phase, updated_at)
      VALUES (?, ?, ?, ?)`).run('test-project', '/path/to/project', 'design', '2026-05-23');

    db.prepare(`INSERT INTO gates (project_name, name, status, evidence_path, checked_at)
      VALUES (?, ?, ?, ?, ?)`).run('test-project', 'Gate 1', 'pass', '/path/to/evidence', '2026-05-23T10:00:00');

    db.prepare(`INSERT INTO gates (project_name, name, status, checked_at)
      VALUES (?, ?, ?, ?)`).run('test-project', 'Gate 2', 'pending', '2026-05-23T11:00:00');

    db.close();

    // 重新打开，触发迁移
    db = openDatabase(testDbPath);

    // 验证新 schema
    const columns = db.prepare(`PRAGMA table_info(gates)`).all();
    const columnNames = columns.map(col => col.name);

    expect(columnNames).toContain('scope_type');
    expect(columnNames).toContain('scope_id');
    expect(columnNames).toContain('gate_name');

    // 验证数据迁移
    const gates = db.prepare(`SELECT * FROM gates ORDER BY id`).all();

    expect(gates).toHaveLength(2);
    expect(gates[0].scope_type).toBe('project');
    expect(gates[0].scope_id).toBe('test-project');
    expect(gates[0].gate_name).toBe('Gate 1');
    expect(gates[0].status).toBe('pass');
    expect(gates[0].evidence_path).toBe('/path/to/evidence');

    expect(gates[1].scope_type).toBe('project');
    expect(gates[1].scope_id).toBe('test-project');
    expect(gates[1].gate_name).toBe('Gate 2');
    expect(gates[1].status).toBe('pending');
  });

  it('空库不触发迁移', () => {
    db = openDatabase(testDbPath);

    const columns = db.prepare(`PRAGMA table_info(gates)`).all();
    const columnNames = columns.map(col => col.name);

    expect(columnNames).toContain('scope_type');
    expect(columnNames).toContain('scope_id');
    expect(columnNames).toContain('gate_name');
  });

  it('已迁移的库不重复迁移', () => {
    db = openDatabase(testDbPath);

    // 插入新 schema 数据
    db.prepare(`INSERT INTO gates (scope_type, scope_id, gate_name, status, checked_at)
      VALUES (?, ?, ?, ?, ?)`).run('milestone', 'm1', 'Gate A', 'pass', '2026-05-23T10:00:00');

    db.close();

    // 重新打开
    db = openDatabase(testDbPath);

    const gates = db.prepare(`SELECT * FROM gates`).all();
    expect(gates).toHaveLength(1);
    expect(gates[0].scope_type).toBe('milestone');
  });
});
