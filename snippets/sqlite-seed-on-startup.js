// better-sqlite3 启动时 seed：既填初始数据，又不会在重启时覆盖运行时累计字段。
// 关键：INSERT OR IGNORE by PRIMARY KEY，已存在的行跳过，不覆盖。
//
// 适用：seed 内容是静态（博客文章骨架、默认配置、分类枚举）。
// 不适用：需要版本化迁移（ALTER TABLE 等）——换 knex 或手写 schema_version 表。

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

function createDbWithSeed({ dbPath, seedPath, schema, insertSQL, table }) {
  if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(schema);

  if (fs.existsSync(seedPath)) {
    const rows = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
    const insert = db.prepare(insertSQL);
    // 事务 = seed 全部成功或全部失败
    const txn = db.transaction(list => list.forEach(r => insert.run(r)));
    txn(rows);
  }
  return db;
}

// 用法：
// const db = createDbWithSeed({
//   dbPath: path.join(__dirname, 'data', 'blog.db'),
//   seedPath: path.join(__dirname, 'data', 'posts.json'),
//   schema: `CREATE TABLE IF NOT EXISTS posts (
//     id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT, views INTEGER DEFAULT 0
//   );`,
//   insertSQL: `INSERT OR IGNORE INTO posts (id, title, body) VALUES (@id, @title, @body)`,
//   table: 'posts'
// });

module.exports = { createDbWithSeed };
