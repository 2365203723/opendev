const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function openDatabase(databasePath) {
  if (!databasePath) return null;

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
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
  `);
  return db;
}

module.exports = { openDatabase };
