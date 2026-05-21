const EventEmitter = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClaudeRunner } = require('../src/runner/claudeRunner');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-runner-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function createProcess(exitCode) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  process.nextTick(() => {
    child.stdout.emit('data', Buffer.from('{"type":"result","subtype":"success"}\n'));
    child.stderr.emit('data', Buffer.from(''));
    child.emit('close', exitCode);
  });
  return child;
}

describe('createClaudeRunner', () => {
  it('creates a run, writes logs, and marks success', async () => {
    const createdRuns = [];
    const finishedRuns = [];
    const runner = createClaudeRunner({
      config: {
        claudeCommand: 'claude',
        claudeAssetsDir: 'H:/claude-assets',
        logsDir: tmpDir
      },
      store: {
        createRun: run => createdRuns.push(run),
        finishRun: run => finishedRuns.push(run)
      },
      spawnFn: (_file, _args) => createProcess(0),
      idFn: () => 'run-1',
      nowFn: () => '2026-05-22T04:00:00.000Z'
    });

    const run = await runner.start({ commandType: 'go', targetName: 'demo' });

    expect(run).toMatchObject({ id: 'run-1', commandType: 'go', targetName: 'demo', status: 'completed' });
    expect(createdRuns[0]).toMatchObject({ id: 'run-1', status: 'running' });
    expect(finishedRuns[0]).toMatchObject({ id: 'run-1', status: 'completed', exitCode: 0, errorMessage: null });
    expect(fs.readFileSync(path.join(tmpDir, 'run-1.log'), 'utf8')).toContain('success');
  });

  it('marks failed runs with stderr content', async () => {
    const finishedRuns = [];
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    process.nextTick(() => {
      child.stderr.emit('data', Buffer.from('permission denied'));
      child.emit('close', 1);
    });

    const runner = createClaudeRunner({
      config: { claudeCommand: 'claude', claudeAssetsDir: 'H:/claude-assets', logsDir: tmpDir },
      store: { createRun: () => {}, finishRun: run => finishedRuns.push(run) },
      spawnFn: () => child,
      idFn: () => 'run-2',
      nowFn: () => '2026-05-22T04:00:00.000Z'
    });

    const run = await runner.start({ commandType: 'go', targetName: 'demo' });

    expect(run.status).toBe('failed');
    expect(finishedRuns[0]).toMatchObject({ status: 'failed', exitCode: 1, errorMessage: 'permission denied' });
  });
});
