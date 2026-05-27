const request = require('supertest');
const { createApp } = require('../src/app');
const { createConfig } = require('../src/config');
const { openDatabase } = require('../src/db');
const { createProjectIndexer } = require('../src/indexer/projectIndexer');
const { createClaudeRunner } = require('../src/runner/claudeRunner');
const { createStore } = require('../src/store');

describe('health API', () => {
  it('returns service status without touching project files', async () => {
    const app = createApp({
      store: null,
      indexer: null,
      runner: null,
      config: { version: '0.1.0' }
    });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      service: 'one-person-dev-company-control-plane',
      version: '0.1.0'
    });
  });

  it('returns a fixed 404 error', async () => {
    const app = createApp({
      store: null,
      indexer: null,
      runner: null,
      config: { version: '0.1.0' }
    });

    const response = await request(app).get('/missing');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not found: GET /missing' });
  });

  it('covers task one placeholder modules', () => {
    const defaultConfig = createConfig({});

    expect(defaultConfig).toMatchObject({
      version: '0.1.0',
      host: '127.0.0.1',
      port: 3100,
      projectsDir: 'E:/projects',
      qaReportsDir: 'G:/qa-reports',
      logsDir: 'G:/logs/agents',
      lessonsDir: 'H:/claude-assets/lessons',
      claudeAssetsDir: 'H:/claude-assets',
      claudeCommand: 'claude'
    });
    expect(defaultConfig.databasePath.endsWith('control-plane/data/control-plane.db')).toBe(true);
    expect(() => createConfig({ CONTROL_PLANE_HOST: '0.0.0.0' })).toThrow('CONTROL_PLANE_HOST must be 127.0.0.1 or localhost');

    const config = createConfig({
      CONTROL_PLANE_HOST: '127.0.0.1',
      CONTROL_PLANE_PORT: '3200',
      CONTROL_PLANE_DB: 'custom.db',
      PROJECTS_DIR: 'P:/projects',
      QA_REPORTS_DIR: 'Q:/reports',
      AGENT_LOGS_DIR: 'L:/agents',
      LESSONS_DIR: 'L:/lessons',
      CLAUDE_ASSETS_DIR: 'C:/assets',
      CLAUDE_COMMAND: 'claude-dev'
    });

    expect(config).toEqual({
      version: '0.1.0',
      host: '127.0.0.1',
      port: 3200,
      databasePath: 'custom.db',
      projectsDir: 'P:/projects',
      qaReportsDir: 'Q:/reports',
      logsDir: 'L:/agents',
      lessonsDir: 'L:/lessons',
      claudeAssetsDir: 'C:/assets',
      claudeCommand: 'claude-dev',
      dangerouslySkipPermissions: false
    });
    expect(openDatabase()).toBeNull();
    expect(createStore()).toBeNull();
    expect(createProjectIndexer()).toBeNull();
    expect(createClaudeRunner()).toBeNull();
  });
});
