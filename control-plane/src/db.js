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

module.exports = { openDatabase };
