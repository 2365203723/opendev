const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'app.db');
const SEED_PATH = path.join(DATA_DIR, 'seed.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// TODO: 替换成你的 schema
db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Seed（可选）：文件存在则 INSERT OR IGNORE，不覆盖运行时数据
if (fs.existsSync(SEED_PATH)) {
  const items = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8'));
  const insert = db.prepare('INSERT OR IGNORE INTO items (id, name) VALUES (@id, @name)');
  const txn = db.transaction(rows => rows.forEach(r => insert.run(r)));
  txn(items);
}

module.exports = db;
