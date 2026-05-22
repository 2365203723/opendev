const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { createAppWithRuntime } = require('../src/server');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-plane-startup-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('runtime app wiring', () => {
  it('indexes a project through real app dependencies', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(path.join(projectsDir, 'demo'), { recursive: true });
    fs.writeFileSync(path.join(projectsDir, 'demo', '.status.json'), JSON.stringify({
      project: 'demo',
      phase: 'build',
      complexity: 'small',
      agents: { backend: { status: 'done' } },
      gates: { gate3: 'pass' },
      updatedAt: '2026-05-22T06:00:00.000Z'
    }));

    const { app, db } = createAppWithRuntime({
      CONTROL_PLANE_DB: path.join(tmpDir, 'db', 'control-plane.db'),
      PROJECTS_DIR: projectsDir,
      QA_REPORTS_DIR: path.join(tmpDir, 'qa'),
      AGENT_LOGS_DIR: path.join(tmpDir, 'logs'),
      LESSONS_DIR: path.join(tmpDir, 'lessons'),
      CLAUDE_ASSETS_DIR: 'H:/claude-assets'
    });

    const rebuild = await request(app).post('/api/index/rebuild');
    const dashboard = await request(app).get('/api/dashboard');

    db.close();
    expect(rebuild.body).toEqual({ indexedProjects: 1, errors: [] });
    expect(dashboard.body.projects[0].name).toBe('demo');
    expect(dashboard.body.summary.totalProjects).toBe(1);
  });
});
