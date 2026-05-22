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
  const { app, config } = createAppWithRuntime(process.env);
  app.listen(config.port, config.host, () => {
    process.stdout.write(`Control Plane running at http://${config.host}:${config.port}\n`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { createAppWithRuntime, startServer };
