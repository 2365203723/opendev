const fs = require('fs');
const os = require('os');
const path = require('path');
const { readProjectStatusFiles } = require('../src/indexer/statusReader');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'status-reader-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('readProjectStatusFiles', () => {
  it('returns parsed project status records and file metadata', () => {
    fs.mkdirSync(path.join(tmpDir, 'demo'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'demo', '.status.json'), JSON.stringify({
      project: 'demo',
      phase: 'build',
      complexity: 'small',
      reopenCount: 1,
      agents: {
        backend: { status: 'done', lastRun: '2026-05-22T00:00:00.000Z' },
        reviewer: { status: 'blocked', blockReason: 'codex-unavailable' }
      },
      gates: { gate1: 'pass', gate2: 'pending' },
      updatedAt: '2026-05-22T01:00:00.000Z'
    }, null, 2));

    const result = readProjectStatusFiles(tmpDir);

    expect(result.errors).toEqual([]);
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]).toMatchObject({
      project: {
        name: 'demo',
        rootPath: path.join(tmpDir, 'demo').replace(/\\/g, '/'),
        phase: 'build',
        complexity: 'small',
        reopenCount: 1,
        updatedAt: '2026-05-22T01:00:00.000Z'
      },
      agents: [
        { projectName: 'demo', name: 'backend', status: 'done', lastRun: '2026-05-22T00:00:00.000Z', blockReason: null },
        { projectName: 'demo', name: 'reviewer', status: 'blocked', lastRun: null, blockReason: 'codex-unavailable' }
      ],
      gates: [
        { projectName: 'demo', name: 'gate1', status: 'pass', evidencePath: null },
        { projectName: 'demo', name: 'gate2', status: 'pending', evidencePath: null }
      ]
    });
    expect(result.projects[0].artifacts[0]).toMatchObject({
      projectName: 'demo',
      type: 'status',
      path: path.join(tmpDir, 'demo', '.status.json').replace(/\\/g, '/'),
      summary: 'phase=build gates=2 agents=2'
    });
    expect(result.projects[0].artifacts[0].hash).toHaveLength(64);
  });

  it('reports invalid status JSON without throwing', () => {
    fs.mkdirSync(path.join(tmpDir, 'bad'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'bad', '.status.json'), '{');

    const result = readProjectStatusFiles(tmpDir);

    expect(result.projects).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].path.endsWith('/bad/.status.json')).toBe(true);
    expect(result.errors[0].message).toContain('Expected property name');
  });

  it('uses safe defaults for sparse status files', () => {
    fs.mkdirSync(path.join(tmpDir, 'fallback'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'fallback', '.status.json'), JSON.stringify({}));

    const result = readProjectStatusFiles(tmpDir);

    expect(result.errors).toEqual([]);
    expect(result.projects[0]).toMatchObject({
      project: {
        name: 'fallback',
        phase: 'unknown',
        complexity: 'unknown',
        reopenCount: 0
      },
      agents: [],
      gates: []
    });
    expect(result.projects[0].project.updatedAt).toEqual(expect.any(String));
    expect(result.projects[0].artifacts[0].summary).toBe('phase=unknown gates=0 agents=0');
  });

  it('defaults missing agent fields and gate status', () => {
    fs.mkdirSync(path.join(tmpDir, 'defaults'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'defaults', '.status.json'), JSON.stringify({
      project: 'defaults',
      agents: { backend: {} },
      gates: { gate1: '' }
    }));

    const result = readProjectStatusFiles(tmpDir);

    expect(result.projects[0].agents).toEqual([
      { projectName: 'defaults', name: 'backend', status: 'pending', lastRun: null, blockReason: null }
    ]);
    expect(result.projects[0].gates).toEqual([
      { projectName: 'defaults', name: 'gate1', status: 'pending', evidencePath: null }
    ]);
  });

  it('returns an error when projects directory is missing', () => {
    const result = readProjectStatusFiles(path.join(tmpDir, 'missing'));

    expect(result.projects).toEqual([]);
    expect(result.errors).toEqual([
      {
        path: path.join(tmpDir, 'missing').replace(/\\/g, '/'),
        message: 'projects directory does not exist'
      }
    ]);
  });
});
