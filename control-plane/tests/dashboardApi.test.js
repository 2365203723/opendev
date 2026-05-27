const request = require('supertest');
const { createApp } = require('../src/app');

function createTestStore() {
  return {
    listProjects: () => [
      { name: 'demo', rootPath: 'E:/projects/demo', phase: 'build', complexity: 'small', reopenCount: 0, updatedAt: '2026-05-22T01:00:00.000Z' },
      { name: 'blocked', rootPath: 'E:/projects/blocked', phase: 'build', complexity: 'medium', reopenCount: 3, updatedAt: '2026-05-22T02:00:00.000Z' },
      { name: 'warned', rootPath: 'E:/projects/warned', phase: 'qa', complexity: 'small', reopenCount: 0, updatedAt: '2026-05-22T03:00:00.000Z' }
    ],
    getProject: name => name === 'demo'
      ? { name: 'demo', rootPath: 'E:/projects/demo', phase: 'build', complexity: 'small', reopenCount: 0, updatedAt: '2026-05-22T01:00:00.000Z' }
      : null,
    listAgents: name => name === 'blocked'
      ? [{ projectName: 'blocked', name: 'reviewer', status: 'blocked', lastRun: null, blockReason: 'codex-unavailable' }]
      : [{ projectName: name, name: 'backend', status: 'in_progress', lastRun: null, blockReason: null }],
    listGates: name => {
      if (name === 'blocked') {
        return [{ projectName: 'blocked', name: 'gate4', status: 'fail', evidencePath: 'G:/qa-reports/blocked/review.md', checkedAt: '2026-05-22 02:00:00' }];
      }
      if (name === 'warned') {
        return [{ projectName: 'warned', name: 'gate5', status: 'warning', evidencePath: 'G:/qa-reports/warned/review.md', checkedAt: '2026-05-22 03:00:00' }];
      }
      return [{ projectName: 'demo', name: 'gate3', status: 'pass', evidencePath: null, checkedAt: '2026-05-22 01:00:00' }];
    },
    listArtifacts: () => [{ projectName: 'demo', type: 'status', path: 'E:/projects/demo/.status.json', hash: 'abc', mtimeMs: 1, summary: 'phase=build', indexedAt: '2026-05-22 01:00:00' }],
    listRuns: () => []
  };
}

function createEmptyStore() {
  return {
    listProjects: () => [],
    getProject: () => null,
    listAgents: () => [],
    listGates: () => [],
    listArtifacts: () => [],
    listRuns: () => []
  };
}

describe('dashboard APIs', () => {
  it('rebuilds the index through the indexer', async () => {
    const app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing' },
      store: createTestStore(),
      indexer: { rebuild: () => ({ indexedProjects: 2, errors: [] }) },
      runner: null
    });

    const response = await request(app).post('/api/index/rebuild');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ indexedProjects: 2, errors: [] });
  });

  it('returns dashboard metrics with blockers and failing gates', async () => {
    const app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing' },
      store: createTestStore(),
      indexer: { rebuild: () => ({ indexedProjects: 2, errors: [] }) },
      runner: null
    });

    const response = await request(app).get('/api/dashboard');

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({ totalProjects: 3, activeAgents: 2, blockedProjects: 1, lessonsCount: 0 });
    expect(response.body.blockers).toEqual([
      { projectName: 'blocked', agent: 'reviewer', reason: 'codex-unavailable' }
    ]);
    expect(response.body.failingGates).toEqual([
      { projectName: 'blocked', gate: 'gate4', status: 'fail', evidencePath: 'G:/qa-reports/blocked/review.md' },
      { projectName: 'warned', gate: 'gate5', status: 'warning', evidencePath: 'G:/qa-reports/warned/review.md' }
    ]);
  });

  it('returns an empty dashboard when the store has no data', async () => {
    const app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing' },
      store: createEmptyStore(),
      indexer: { rebuild: () => ({ indexedProjects: 0, errors: [] }) },
      runner: null
    });

    const response = await request(app).get('/api/dashboard');

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({ totalProjects: 0, activeAgents: 0, blockedProjects: 0, lessonsCount: 0 });
    expect(response.body.projects).toEqual([]);
    expect(response.body.blockers).toEqual([]);
    expect(response.body.failingGates).toEqual([]);
    expect(response.body.runs).toEqual([]);
  });

  it('returns project details with agents, gates, and artifacts', async () => {
    const app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing' },
      store: createTestStore(),
      indexer: { rebuild: () => ({ indexedProjects: 2, errors: [] }) },
      runner: null
    });

    const response = await request(app).get('/api/projects/demo');

    expect(response.status).toBe(200);
    expect(response.body.project.name).toBe('demo');
    expect(response.body.agents).toHaveLength(1);
    expect(response.body.gates).toHaveLength(1);
    expect(response.body.artifacts).toHaveLength(1);
  });

  it('returns 404 when project details are missing', async () => {
    const app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing' },
      store: createTestStore(),
      indexer: { rebuild: () => ({ indexedProjects: 2, errors: [] }) },
      runner: null
    });

    const response = await request(app).get('/api/projects/missing');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'project not found' });
  });

  it('returns 503 when starting a run without a runner', async () => {
    const app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing' },
      store: createTestStore(),
      indexer: { rebuild: () => ({ indexedProjects: 2, errors: [] }) },
      runner: null
    });

    const response = await request(app)
      .post('/api/runs')
      .send({ commandType: 'go', targetName: 'demo' });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'runner unavailable' });
  });

  it('rejects run payloads that are not plain objects', async () => {
    const runner = { start: vi.fn() };
    const app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing' },
      store: createTestStore(),
      indexer: { rebuild: () => ({ indexedProjects: 2, errors: [] }) },
      runner
    });

    const response = await request(app)
      .post('/api/runs')
      .send([{ commandType: 'go', targetName: 'demo' }]);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'body must be a plain object' });
    expect(runner.start).not.toHaveBeenCalled();
  });

  it('rejects run payloads with unknown fields', async () => {
    const runner = { start: vi.fn() };
    const app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing' },
      store: createTestStore(),
      indexer: { rebuild: () => ({ indexedProjects: 2, errors: [] }) },
      runner
    });

    const response = await request(app)
      .post('/api/runs')
      .send({ commandType: 'go', targetName: 'demo', extra: true });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'unknown field: extra' });
    expect(runner.start).not.toHaveBeenCalled();
  });

  it('rejects run payloads with invalid commandType', async () => {
    const runner = { start: vi.fn() };
    const app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing' },
      store: createTestStore(),
      indexer: { rebuild: () => ({ indexedProjects: 2, errors: [] }) },
      runner
    });

    const response = await request(app)
      .post('/api/runs')
      .send({ commandType: 'deploy', targetName: 'demo' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid commandType' });
    expect(runner.start).not.toHaveBeenCalled();
  });

  it('rejects run payloads with invalid targetName', async () => {
    const runner = { start: vi.fn() };
    const app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing' },
      store: createTestStore(),
      indexer: { rebuild: () => ({ indexedProjects: 2, errors: [] }) },
      runner
    });

    const response = await request(app)
      .post('/api/runs')
      .send({ commandType: 'go', targetName: '../demo' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid targetName' });
    expect(runner.start).not.toHaveBeenCalled();
  });

  it('starts runs with a validated payload', async () => {
    const run = { id: 'run-1', commandType: 'go', targetName: 'demo' };
    const runner = { start: vi.fn(async () => run) };
    const app = createApp({
      config: { version: '0.1.0', logsDir: 'missing', lessonsDir: 'missing' },
      store: createTestStore(),
      indexer: { rebuild: () => ({ indexedProjects: 2, errors: [] }) },
      runner
    });

    const response = await request(app)
      .post('/api/runs')
      .send({ commandType: 'go', targetName: '  demo-项目_1  ' });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ status: 'queued', commandType: 'go', targetName: 'demo-项目_1' });
    expect(runner.start).toHaveBeenCalledWith(expect.objectContaining({ commandType: 'go', targetName: 'demo-项目_1' }));
  });
});
