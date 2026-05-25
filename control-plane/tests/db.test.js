const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/db');
const { createStore } = require('../src/store');

let tmpDir;
let db;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-plane-db-'));
  db = openDatabase(path.join(tmpDir, 'control-plane.db'));
});

afterEach(() => {
  if (db) db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('SQLite store', () => {
  it('creates schema and enables WAL with foreign keys', () => {
    const journalMode = db.pragma('journal_mode', { simple: true });
    const foreignKeys = db.pragma('foreign_keys', { simple: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(row => row.name);

    expect(journalMode.toLowerCase()).toBe('wal');
    expect(foreignKeys).toBe(1);
    expect(tables).toEqual([
      'agents',
      'approvals',
      'artifacts',
      'change_requests',
      'cr_documents',
      'episodes',
      'facts',
      'gates',
      'milestones',
      'products',
      'projects',
      'raw_events',
      'regression_results',
      'retrieval_packs',
      'runs',
      'sqlite_sequence',
      'tasks',
      'workstreams'
    ]);
  });

  it('replaces indexed project data without creating duplicate rows', () => {
    const store = createStore(db);

    store.replaceProjectIndex({
      project: {
        name: 'demo',
        rootPath: 'E:/projects/demo',
        phase: 'build',
        complexity: 'small',
        reopenCount: 1,
        updatedAt: '2026-05-22T01:00:00.000Z'
      },
      agents: [
        { projectName: 'demo', name: 'backend', status: 'done', lastRun: '2026-05-22T00:00:00.000Z', blockReason: null }
      ],
      gates: [
        { projectName: 'demo', name: 'gate3', status: 'pass', evidencePath: 'E:/projects/demo/doc/acceptance-matrix.md' }
      ],
      artifacts: [
        { projectName: 'demo', type: 'status', path: 'E:/projects/demo/.status.json', hash: 'abc', mtimeMs: 1, summary: 'phase=build' }
      ]
    });

    store.replaceProjectIndex({
      project: {
        name: 'demo',
        rootPath: 'E:/projects/demo',
        phase: 'ship',
        complexity: 'small',
        reopenCount: 2,
        updatedAt: '2026-05-22T02:00:00.000Z'
      },
      agents: [],
      gates: [],
      artifacts: []
    });

    expect(store.listProjects()).toEqual([
      {
        name: 'demo',
        rootPath: 'E:/projects/demo',
        phase: 'ship',
        complexity: 'small',
        reopenCount: 2,
        updatedAt: '2026-05-22T02:00:00.000Z'
      }
    ]);
    expect(db.prepare('SELECT COUNT(*) AS count FROM agents').get().count).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS count FROM gates').get().count).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS count FROM artifacts').get().count).toBe(0);
  });

  it('uses project name from payload for child rows', () => {
    const store = createStore(db);

    store.replaceProjectIndex({
      project: {
        name: 'demo',
        rootPath: 'E:/projects/demo',
        phase: 'build',
        complexity: 'small',
        reopenCount: 1,
        updatedAt: '2026-05-22T01:00:00.000Z'
      },
      agents: [
        { projectName: 'wrong', name: 'backend', status: 'done', lastRun: '2026-05-22T00:00:00.000Z', blockReason: null }
      ],
      gates: [
        { projectName: 'wrong', name: 'gate3', status: 'pass', evidencePath: 'E:/projects/demo/doc/acceptance-matrix.md' }
      ],
      artifacts: [
        { projectName: 'wrong', type: 'status', path: 'E:/projects/demo/.status.json', hash: 'abc', mtimeMs: 1, summary: 'phase=build' }
      ]
    });

    expect(store.listAgents('demo')).toEqual([
      { projectName: 'demo', name: 'backend', status: 'done', lastRun: '2026-05-22T00:00:00.000Z', blockReason: null }
    ]);
    expect(store.listGates('demo')).toMatchObject([
      { projectName: 'demo', name: 'gate3', status: 'pass', evidencePath: 'E:/projects/demo/doc/acceptance-matrix.md' }
    ]);
    expect(store.listArtifacts('demo')).toMatchObject([
      { projectName: 'demo', type: 'status', path: 'E:/projects/demo/.status.json', hash: 'abc', mtimeMs: 1, summary: 'phase=build' }
    ]);
    expect(store.listAgents('wrong')).toEqual([]);
    expect(store.listGates('wrong')).toEqual([]);
    expect(store.listArtifacts('wrong')).toEqual([]);
  });

  it('rolls back all project indexes when one project fails during batch replacement', () => {
    const store = createStore(db);

    expect(() => store.replaceProjectIndexes([
      {
        project: {
          name: 'first',
          rootPath: 'E:/projects/first',
          phase: 'build',
          complexity: 'small',
          reopenCount: 0,
          updatedAt: '2026-05-22T01:00:00.000Z'
        },
        agents: [],
        gates: [],
        artifacts: [
          { projectName: 'first', type: 'status', path: 'E:/projects/first/.status.json', hash: 'abc', mtimeMs: 1, summary: 'phase=build' }
        ]
      },
      {
        project: {
          name: 'second',
          rootPath: 'E:/projects/second',
          phase: 'build',
          complexity: 'small',
          reopenCount: 0,
          updatedAt: '2026-05-22T01:00:00.000Z'
        },
        agents: [],
        gates: [],
        artifacts: [
          { projectName: 'second', type: 'status', path: 'E:/projects/second/.status.json', hash: null, mtimeMs: 1, summary: 'phase=build' }
        ]
      }
    ])).toThrow();

    expect(store.listProjects()).toEqual([]);
  });

  it('lists indexed project details and run history', () => {
    const store = createStore(db);

    store.replaceProjectIndex({
      project: {
        name: 'demo',
        rootPath: 'E:/projects/demo',
        phase: 'build',
        complexity: 'small',
        reopenCount: 1,
        updatedAt: '2026-05-22T01:00:00.000Z'
      },
      agents: [
        { projectName: 'demo', name: 'backend', status: 'done', lastRun: '2026-05-22T00:00:00.000Z', blockReason: null }
      ],
      gates: [
        { projectName: 'demo', name: 'gate3', status: 'pass', evidencePath: 'E:/projects/demo/doc/acceptance-matrix.md' }
      ],
      artifacts: [
        { projectName: 'demo', type: 'status', path: 'E:/projects/demo/.status.json', hash: 'abc', mtimeMs: 1, summary: 'phase=build' }
      ]
    });
    store.createRun({
      id: 'run-1',
      commandType: 'go',
      targetName: 'demo',
      status: 'running',
      prompt: '/go demo',
      logPath: 'G:/logs/agents/run-1.log',
      startedAt: '2026-05-22T03:00:00.000Z'
    });
    store.finishRun({
      id: 'run-1',
      status: 'done',
      exitCode: 0,
      errorMessage: null,
      finishedAt: '2026-05-22T03:01:00.000Z'
    });

    expect(store.getProject('demo')).toEqual({
      name: 'demo',
      rootPath: 'E:/projects/demo',
      phase: 'build',
      complexity: 'small',
      reopenCount: 1,
      updatedAt: '2026-05-22T01:00:00.000Z'
    });
    expect(store.getProject('missing')).toBeNull();
    expect(store.listAgents('demo')).toEqual([
      { projectName: 'demo', name: 'backend', status: 'done', lastRun: '2026-05-22T00:00:00.000Z', blockReason: null }
    ]);
    expect(store.listGates('demo')).toMatchObject([
      { projectName: 'demo', name: 'gate3', status: 'pass', evidencePath: 'E:/projects/demo/doc/acceptance-matrix.md' }
    ]);
    expect(store.listArtifacts('demo')).toMatchObject([
      { projectName: 'demo', type: 'status', path: 'E:/projects/demo/.status.json', hash: 'abc', mtimeMs: 1, summary: 'phase=build' }
    ]);
    expect(store.listRuns()).toEqual([
      {
        id: 'run-1',
        commandType: 'go',
        targetName: 'demo',
        status: 'done',
        prompt: '/go demo',
        logPath: 'G:/logs/agents/run-1.log',
        exitCode: 0,
        errorMessage: null,
        startedAt: '2026-05-22T03:00:00.000Z',
        finishedAt: '2026-05-22T03:01:00.000Z',
        sessionId: null,
        tokenIn: null,
        tokenOut: null,
        durationMs: null,
        costCents: null
      }
    ]);
  });
});
