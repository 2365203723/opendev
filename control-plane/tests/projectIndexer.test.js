const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { createApp } = require('../src/app');
const { createConfig } = require('../src/config');
const { createProjectIndexer } = require('../src/indexer/projectIndexer');
const { createClaudeRunner } = require('../src/runner/claudeRunner');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-indexer-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('createProjectIndexer', () => {
  it('rebuilds the store from file-system status files', () => {
    fs.mkdirSync(path.join(tmpDir, 'demo'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'demo', '.status.json'), JSON.stringify({
      project: 'demo',
      phase: 'design',
      complexity: 'medium',
      reopenCount: 0,
      agents: { architect: { status: 'done' } },
      gates: { gate2: 'pass' },
      updatedAt: '2026-05-22T03:00:00.000Z'
    }));

    const saved = [];
    const indexer = createProjectIndexer({
      config: { projectsDir: tmpDir },
      store: { replaceProjectIndex: payload => saved.push(payload) }
    });

    const result = indexer.rebuild();

    expect(result).toEqual({ indexedProjects: 1, errors: [] });
    expect(saved).toHaveLength(1);
    expect(saved[0].project.name).toBe('demo');
    expect(saved[0].gates[0]).toEqual({ projectName: 'demo', name: 'gate2', status: 'pass', evidencePath: null });
  });

  it('returns read errors without saving projects', () => {
    const missingDir = path.join(tmpDir, 'missing');
    const saved = [];
    const indexer = createProjectIndexer({
      config: { projectsDir: missingDir },
      store: { replaceProjectIndex: payload => saved.push(payload) }
    });

    const result = indexer.rebuild();

    expect(result).toEqual({
      indexedProjects: 0,
      errors: [{ path: missingDir.replace(/\\/g, '/'), message: 'projects directory does not exist' }]
    });
    expect(saved).toEqual([]);
  });

  it('keeps existing app and runner behavior covered in the focused run', async () => {
    const app = createApp({
      store: null,
      indexer: null,
      runner: null,
      config: { version: '0.1.0' }
    });

    const healthResponse = await request(app).get('/api/health');
    const missingResponse = await request(app).get('/missing');

    expect(healthResponse.status).toBe(200);
    expect(healthResponse.body).toEqual({
      ok: true,
      service: 'one-person-dev-company-control-plane',
      version: '0.1.0'
    });
    expect(missingResponse.status).toBe(404);
    expect(missingResponse.body).toEqual({ error: 'not found: GET /missing' });
    expect(createConfig({ CONTROL_PLANE_PORT: '3200' }).port).toBe(3200);
    expect(() => createConfig({ CONTROL_PLANE_HOST: '0.0.0.0' })).toThrow('CONTROL_PLANE_HOST must be 127.0.0.1 or localhost');
    expect(() => createConfig({ CONTROL_PLANE_PORT: 'abc' })).toThrow('CONTROL_PLANE_PORT must be an integer between 1 and 65535');
    expect(createClaudeRunner()).toBeNull();
  });
});
