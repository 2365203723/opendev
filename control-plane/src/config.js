const path = require('path');

const repoRoot = path.join(__dirname, '..', '..').replace(/\\/g, '/');

function readLocalHost(value) {
  const host = value || '127.0.0.1';
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('CONTROL_PLANE_HOST must be 127.0.0.1 or localhost');
  }
  return host;
}

function readPort(value) {
  const port = Number(value || 3100);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('CONTROL_PLANE_PORT must be an integer between 1 and 65535');
  }
  return port;
}

function defaultDatabasePath() {
  return path.join(__dirname, '..', 'data', 'control-plane.db').replace(/\\/g, '/');
}

function repoPath(...segments) {
  return path.join(repoRoot, ...segments).replace(/\\/g, '/');
}

function createConfig(env) {
  return {
    version: '0.1.0',
    host: readLocalHost(env.CONTROL_PLANE_HOST),
    port: readPort(env.CONTROL_PLANE_PORT),
    databasePath: (env.CONTROL_PLANE_DB || defaultDatabasePath()).replace(/\\/g, '/'),
    projectsDir: env.PROJECTS_DIR || repoPath('data', 'projects'),
    qaReportsDir: env.QA_REPORTS_DIR || repoPath('data', 'qa-reports'),
    logsDir: env.AGENT_LOGS_DIR || repoPath('data', 'logs', 'agents'),
    lessonsDir: env.LESSONS_DIR || repoPath('lessons'),
    claudeAssetsDir: env.CLAUDE_ASSETS_DIR || repoRoot,
    claudeCommand: env.CLAUDE_COMMAND || 'claude',
    dangerouslySkipPermissions: env.DANGEROUSLY_SKIP_PERMISSIONS === 'true'
  };
}

module.exports = { createConfig };
