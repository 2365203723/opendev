const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStatusWatcher } = require('../src/indexer/statusWatcher');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'status-watcher-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const DEBOUNCE = 50;
const WAIT = 300;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('createStatusWatcher', () => {
  it('返回含 close() 方法的 watcher 对象', () => {
    const watcher = createStatusWatcher({
      projectsDir: tmpDir,
      writeEvent: () => {},
      triggerCompress: null,
      debounceMs: DEBOUNCE
    });
    expect(watcher).not.toBeNull();
    expect(typeof watcher.close).toBe('function');
    watcher.close();
  });

  it('写入 .status.json 后触发一次 writeEvent，含正确字段', async () => {
    const events = [];
    const watcher = createStatusWatcher({
      projectsDir: tmpDir,
      writeEvent: e => events.push(e),
      triggerCompress: null,
      debounceMs: DEBOUNCE
    });

    fs.mkdirSync(path.join(tmpDir, 'demo'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'demo', '.status.json'), JSON.stringify({ project: 'demo' }));

    await wait(WAIT);
    watcher.close();

    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('file_changed');
    expect(events[0].scopeType).toBe('project');
    expect(events[0].scopeId).toBe('demo');
    expect(events[0].payload).toHaveProperty('filePath');
    expect(events[0].payload).toHaveProperty('content');
    expect(events[0].payload.content).toContain('demo');
  });

  it('短时间内多次写入同一文件，只触发一次 writeEvent（防抖）', async () => {
    const events = [];
    const watcher = createStatusWatcher({
      projectsDir: tmpDir,
      writeEvent: e => events.push(e),
      triggerCompress: null,
      debounceMs: DEBOUNCE
    });

    fs.mkdirSync(path.join(tmpDir, 'alpha'), { recursive: true });
    const filePath = path.join(tmpDir, 'alpha', '.status.json');

    fs.writeFileSync(filePath, JSON.stringify({ v: 1 }));
    await wait(10);
    fs.writeFileSync(filePath, JSON.stringify({ v: 2 }));
    await wait(10);
    fs.writeFileSync(filePath, JSON.stringify({ v: 3 }));

    await wait(WAIT);
    watcher.close();

    expect(events).toHaveLength(1);
    expect(events[0].scopeId).toBe('alpha');
  });

  it('写入不同项目的 .status.json，各自触发独立的 writeEvent', async () => {
    const events = [];
    const watcher = createStatusWatcher({
      projectsDir: tmpDir,
      writeEvent: e => events.push(e),
      triggerCompress: null,
      debounceMs: DEBOUNCE
    });

    fs.mkdirSync(path.join(tmpDir, 'proj-a'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'proj-b'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'proj-a', '.status.json'), JSON.stringify({ project: 'proj-a' }));
    fs.writeFileSync(path.join(tmpDir, 'proj-b', '.status.json'), JSON.stringify({ project: 'proj-b' }));

    await wait(WAIT);
    watcher.close();

    expect(events).toHaveLength(2);
    const ids = events.map(e => e.scopeId).sort();
    expect(ids).toEqual(['proj-a', 'proj-b']);
  });

  it('写入非 .status.json 文件，不触发 writeEvent', async () => {
    const events = [];
    const watcher = createStatusWatcher({
      projectsDir: tmpDir,
      writeEvent: e => events.push(e),
      triggerCompress: null,
      debounceMs: DEBOUNCE
    });

    fs.mkdirSync(path.join(tmpDir, 'demo'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'demo', 'other.txt'), 'hello');

    await wait(WAIT);
    watcher.close();

    expect(events).toHaveLength(0);
  });

  it('close() 后不再触发 writeEvent', async () => {
    const events = [];
    const watcher = createStatusWatcher({
      projectsDir: tmpDir,
      writeEvent: e => events.push(e),
      triggerCompress: null,
      debounceMs: DEBOUNCE
    });

    fs.mkdirSync(path.join(tmpDir, 'demo'), { recursive: true });
    watcher.close();

    fs.writeFileSync(path.join(tmpDir, 'demo', '.status.json'), JSON.stringify({ project: 'demo' }));
    await wait(WAIT);

    expect(events).toHaveLength(0);
  });

  it('projectsDir 不存在时，createStatusWatcher 不抛错，返回 null', () => {
    const missingDir = path.join(tmpDir, 'nonexistent');
    let result;
    expect(() => {
      result = createStatusWatcher({
        projectsDir: missingDir,
        writeEvent: () => {},
        triggerCompress: null,
        debounceMs: DEBOUNCE
      });
    }).not.toThrow();
    expect(result).toBeNull();
  });

  it('写入 .status.json 时调用 triggerCompress', async () => {
    const compressCalls = [];
    const watcher = createStatusWatcher({
      projectsDir: tmpDir,
      writeEvent: () => {},
      triggerCompress: (scopeType, scopeId) => compressCalls.push({ scopeType, scopeId }),
      debounceMs: DEBOUNCE
    });

    fs.mkdirSync(path.join(tmpDir, 'myproj'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'myproj', '.status.json'), JSON.stringify({ project: 'myproj' }));

    await wait(WAIT);
    watcher.close();

    expect(compressCalls).toHaveLength(1);
    expect(compressCalls[0]).toEqual({ scopeType: 'project', scopeId: 'myproj' });
  });
});
