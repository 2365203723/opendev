function createConfig(env) {
  return {
    version: '0.1.0',
    host: env.CONTROL_PLANE_HOST || '127.0.0.1',
    port: Number(env.CONTROL_PLANE_PORT || 3100),
    databasePath: env.CONTROL_PLANE_DB || 'data/control-plane.db',
    projectsDir: env.PROJECTS_DIR || 'E:/projects',
    qaReportsDir: env.QA_REPORTS_DIR || 'G:/qa-reports',
    logsDir: env.AGENT_LOGS_DIR || 'G:/logs/agents',
    lessonsDir: env.LESSONS_DIR || 'H:/claude-assets/lessons',
    claudeAssetsDir: env.CLAUDE_ASSETS_DIR || 'H:/claude-assets',
    claudeCommand: env.CLAUDE_COMMAND || 'claude'
  };
}

module.exports = { createConfig };
