const request = require('supertest');
const { createApp } = require('../src/app');

function createTestStore() {
  return {
    listProjects: () => [
      { name: 'demo', rootPath: 'E:/projects/demo', phase: 'build', complexity: 'small', reopenCount: 0, updatedAt: '2026-05-22T01:00:00.000Z' },
      { name: 'blocked', rootPath: 'E:/projects/blocked', phase: 'build', complexity: 'medium', reopenCount: 3, updatedAt: '2026-05-22T02:00:00.000Z' }
    ],
    getProject: name => name === 'demo'
      ? { name: 'demo', rootPath: 'E:/projects/demo', phase: 'build', complexity: 'small', reopenCount: 0, updatedAt: '2026-05-22T01:00:00.000Z' }
      : null,
    listAgents: name => name === 'blocked'
      ? [{ projectName: 'blocked', name: 'reviewer', status: 'blocked', lastRun: null, blockReason: 'codex-unavailable' }]
      : [{ projectName: 'demo', name: 'backend', status: 'in_progress', lastRun: null, blockReason: null }],
    listGates: name => name === 'blocked'
      ? [{ projectName: 'blocked', name: 'gate4', status: 'fail', evidencePath: 'G:/qa-reports/blocked/review.md', checkedAt: '2026-05-22 02:00:00' }]
      : [{ projectName: 'demo', name: 'gate3', status: 'pass', evidencePath: null, checkedAt: '2026-05-22 01:00:00' }],
    listArtifacts: () => [{ projectName: 'demo', type: 'status', path: 'E:/projects/demo/.status.json', hash: 'abc', mtimeMs: 1, summary: 'phase=build', indexedAt: '2026-05-22 01:00:00' }],
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
    expect(response.body.summary).toEqual({ totalProjects: 2, activeAgents: 1, blockedProjects: 1, lessonsCount: 0 });
    expect(response.body.blockers).toEqual([
      { projectName: 'blocked', agent: 'reviewer', reason: 'codex-unavailable' }
    ]);
    expect(response.body.failingGates).toEqual([
      { projectName: 'blocked', gate: 'gate4', status: 'fail', evidencePath: 'G:/qa-reports/blocked/review.md' }
    ]);
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
});
