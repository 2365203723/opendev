const fs = require('fs');
const os = require('os');
const path = require('path');
const { createProjectIndexer } = require('../src/indexer/projectIndexer');

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

  it('does not leave partial indexes when a later project write fails', () => {
    fs.mkdirSync(path.join(tmpDir, 'first'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'first', '.status.json'), JSON.stringify({ project: 'first', phase: 'build' }));
    fs.mkdirSync(path.join(tmpDir, 'second'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'second', '.status.json'), JSON.stringify({ project: 'second', phase: 'build' }));

    const written = [];
    const indexer = createProjectIndexer({
      config: { projectsDir: tmpDir },
      store: {
        replaceProjectIndexes: projectIndexes => {
          written.push(projectIndexes);
          throw new Error('db write failed');
        },
        replaceProjectIndex: payload => written.push(payload)
      }
    });

    expect(() => indexer.rebuild()).toThrow('db write failed');
    expect(written).toHaveLength(1);
    expect(written[0]).toHaveLength(2);
  });
});
