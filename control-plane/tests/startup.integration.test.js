const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { createAppWithRuntime, startServer } = require('../src/server');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-plane-startup-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('runtime app wiring', () => {
  function closeServer(server) {
    return new Promise((resolve, reject) => {
      server.close(error => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  function waitForServer(server) {
    if (server.listening) return Promise.resolve();
    return new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
  }

  function getFreePort() {
    return new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address();
        probe.close(error => {
          if (error) reject(error);
          else resolve(address.port);
        });
      });
    });
  }

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

    try {
      const rebuild = await request(app).post('/api/index/rebuild');
      const dashboard = await request(app).get('/api/dashboard');

      expect(rebuild.body).toEqual({ indexedProjects: 1, errors: [] });
      expect(dashboard.body.projects[0].name).toBe('demo');
      expect(dashboard.body.summary.totalProjects).toBe(1);
    } finally {
      db.close();
    }
  });

  it('returns runtime handles that callers can close', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(projectsDir, { recursive: true });
    const port = await getFreePort();
    const env = {
      ...process.env,
      CONTROL_PLANE_HOST: '127.0.0.1',
      CONTROL_PLANE_PORT: String(port),
      CONTROL_PLANE_DB: path.join(tmpDir, 'db', 'control-plane.db'),
      PROJECTS_DIR: projectsDir,
      QA_REPORTS_DIR: path.join(tmpDir, 'qa'),
      AGENT_LOGS_DIR: path.join(tmpDir, 'logs'),
      LESSONS_DIR: path.join(tmpDir, 'lessons'),
      CLAUDE_ASSETS_DIR: 'H:/claude-assets'
    };
    const originalEnv = process.env;
    let runtime;

    try {
      process.env = env;
      runtime = startServer();
      await waitForServer(runtime.server);

      expect(runtime.config.port).toBe(port);
      expect(runtime.db.open).toBe(true);
      expect(runtime.server.listening).toBe(true);
    } finally {
      process.env = originalEnv;
      if (runtime) {
        if (runtime.server.listening) await closeServer(runtime.server);
        if (runtime.db.open) runtime.db.close();
      }
    }
  });
});
