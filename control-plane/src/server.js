const { createApp } = require('./app');
const { createConfig } = require('./config');
const { openDatabase } = require('./db');
const { createStore } = require('./store');
const { createProjectIndexer } = require('./indexer/projectIndexer');
const { createClaudeRunner } = require('./runner/claudeRunner');

function createAppWithRuntime(env) {
  const config = createConfig(env);
  const db = openDatabase(config.databasePath);
  const store = createStore(db);
  const indexer = createProjectIndexer({ config, store });
  const runner = createClaudeRunner({ config, store });
  const app = createApp({ config, store, indexer, runner });
  return { app, config, db, store, indexer, runner };
}

function startServer() {
  const { app, config, db } = createAppWithRuntime(process.env);
  const closeAll = () => {
    if (typeof app.close === 'function') app.close();
    if (db.open) db.close();
  };
  let server;

  try {
    server = app.listen(config.port, config.host, () => {
      process.stdout.write(`Control Plane running at http://${config.host}:${config.port}\n`);
    });
  } catch (error) {
    closeAll();
    throw error;
  }

  server.on('error', error => {
    closeAll();
    if (server.listenerCount('error') === 1) throw error;
  });

  process.on('SIGTERM', () => { if (typeof app.close === 'function') app.close(); });
  process.on('SIGINT', () => { if (typeof app.close === 'function') app.close(); });

  return { server, db, config };
}

if (require.main === module) {
  startServer();
}

module.exports = { createAppWithRuntime, startServer };
