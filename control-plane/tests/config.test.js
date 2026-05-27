const { createConfig } = require('../src/config');

describe('createConfig', () => {
  it('uses safe localhost defaults and portable repository paths', () => {
    const config = createConfig({});

    expect(config).toMatchObject({
      version: '0.1.0',
      host: '127.0.0.1',
      port: 3100,
      claudeCommand: 'claude'
    });
    expect(config.databasePath.endsWith('control-plane/data/control-plane.db')).toBe(true);
    expect(config.projectsDir.endsWith('data/projects')).toBe(true);
    expect(config.qaReportsDir.endsWith('data/qa-reports')).toBe(true);
    expect(config.logsDir.endsWith('data/logs/agents')).toBe(true);
    expect(config.lessonsDir.endsWith('lessons')).toBe(true);
    expect(config.claudeAssetsDir.endsWith('claude-assets')).toBe(true);
  });

  it('accepts explicit local paths from environment variables', () => {
    const config = createConfig({
      CONTROL_PLANE_HOST: '127.0.0.1',
      CONTROL_PLANE_PORT: '3200',
      CONTROL_PLANE_DB: 'C:/tmp/company-os.db',
      PROJECTS_DIR: 'D:/projects',
      QA_REPORTS_DIR: 'D:/qa',
      AGENT_LOGS_DIR: 'D:/logs',
      LESSONS_DIR: 'D:/lessons',
      CLAUDE_ASSETS_DIR: 'D:/assets',
      CLAUDE_COMMAND: 'claude.cmd'
    });

    expect(config).toMatchObject({
      host: '127.0.0.1',
      port: 3200,
      databasePath: 'C:/tmp/company-os.db',
      projectsDir: 'D:/projects',
      qaReportsDir: 'D:/qa',
      logsDir: 'D:/logs',
      lessonsDir: 'D:/lessons',
      claudeAssetsDir: 'D:/assets',
      claudeCommand: 'claude.cmd'
    });
  });

  it('rejects non-localhost binding', () => {
    expect(() => createConfig({ CONTROL_PLANE_HOST: '0.0.0.0' })).toThrow('CONTROL_PLANE_HOST must be 127.0.0.1 or localhost');
  });

  it('rejects invalid port values', () => {
    expect(() => createConfig({ CONTROL_PLANE_PORT: 'abc' })).toThrow('CONTROL_PLANE_PORT must be an integer between 1 and 65535');
    expect(() => createConfig({ CONTROL_PLANE_PORT: '70000' })).toThrow('CONTROL_PLANE_PORT must be an integer between 1 and 65535');
  });
});
