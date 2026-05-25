const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function openDatabase(databasePath) {
  if (!databasePath) return null;

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
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

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      client_name TEXT,
      root_path TEXT,
      status TEXT NOT NULL DEFAULT 'idea',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned',
      gate_scope TEXT,
      target_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workstreams (
      id TEXT PRIMARY KEY,
      milestone_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'todo',
      owner_role TEXT,
      project_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE CASCADE,
      FOREIGN KEY (project_name) REFERENCES projects(name) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      workstream_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'backlog',
      agent_role TEXT,
      priority TEXT,
      acceptance_ref TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workstream_id) REFERENCES workstreams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS gates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope_type TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      gate_name TEXT NOT NULL,
      status TEXT NOT NULL,
      evidence_path TEXT,
      checked_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(scope_type, scope_id, gate_name)
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
      finished_at TEXT,
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
      resolution_note TEXT,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
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

  // Migrate runs table: add missing columns
  const runsColumns = db.prepare(`PRAGMA table_info(runs)`).all().map(c => c.name);
  if (!runsColumns.includes('session_id')) {
    db.exec(`ALTER TABLE runs ADD COLUMN session_id TEXT`);
  }
  if (!runsColumns.includes('token_in')) {
    db.exec(`ALTER TABLE runs ADD COLUMN token_in INTEGER`);
  }
  if (!runsColumns.includes('token_out')) {
    db.exec(`ALTER TABLE runs ADD COLUMN token_out INTEGER`);
  }
  if (!runsColumns.includes('duration_ms')) {
    db.exec(`ALTER TABLE runs ADD COLUMN duration_ms INTEGER`);
  }
  if (!runsColumns.includes('cost_cents')) {
    db.exec(`ALTER TABLE runs ADD COLUMN cost_cents REAL`);
  }

  // Migrate: create approvals table if missing
  const hasApprovals = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='approvals'`).get();
  if (!hasApprovals) {
    db.exec(`
      CREATE TABLE approvals (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        prompt_snapshot TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        resolution_note TEXT,
        FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
      )
    `);
  }

  // Migrate gates table if needed
  const needsMigration = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='gates'
  `).get();

  if (needsMigration) {
    const columns = db.prepare(`PRAGMA table_info(gates)`).all();
    const hasOldSchema = columns.some(col => col.name === 'project_name');

    if (hasOldSchema) {
      console.log('[db] Migrating gates table to new schema...');

      // Backup old data
      const oldGates = db.prepare(`SELECT * FROM gates`).all();

      // Drop old table
      db.exec(`DROP TABLE gates`);

      // Create new table
      db.exec(`
        CREATE TABLE IF NOT EXISTS gates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          scope_type TEXT NOT NULL,
          scope_id TEXT NOT NULL,
          gate_name TEXT NOT NULL,
          status TEXT NOT NULL,
          evidence_path TEXT,
          checked_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(scope_type, scope_id, gate_name)
        )
      `);

      // Migrate data
      const insertStmt = db.prepare(`
        INSERT INTO gates (scope_type, scope_id, gate_name, status, evidence_path, checked_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const gate of oldGates) {
        insertStmt.run(
          'project',
          gate.project_name,
          gate.name,
          gate.status,
          gate.evidence_path,
          gate.checked_at
        );
      }

      console.log(`[db] Migrated ${oldGates.length} gates to new schema`);
    }
  }

  return db;
}

module.exports = { openDatabase };
