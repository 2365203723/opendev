const { createApp } = require('./app');
const { createConfig } = require('./config');
const { openDatabase } = require('./db');
const { createStore } = require('./store');
const { createProjectIndexer } = require('./indexer/projectIndexer');
const { createClaudeRunner } = require('./runner/claudeRunner');

const config = createConfig(process.env);
const db = openDatabase(config.databasePath);
const store = createStore(db);
const indexer = createProjectIndexer({ config, store });
const runner = createClaudeRunner({ config, store });
const app = createApp({ config, store, indexer, runner });

app.listen(config.port, config.host, () => {
  process.stdout.write(`Control Plane running at http://${config.host}:${config.port}
`);
});
