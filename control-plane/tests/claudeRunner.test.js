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

  it('marks spawn errors failed once and writes the error to logs', async () => {
    const finishedRuns = [];
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    process.nextTick(() => {
      child.emit('error', new Error('spawn claude ENOENT'));
      child.emit('close', 1);
    });

    const runner = createClaudeRunner({
      config: { claudeCommand: 'claude', claudeAssetsDir: 'H:/claude-assets', logsDir: tmpDir },
      store: { createRun: () => {}, finishRun: run => finishedRuns.push(run) },
      spawnFn: () => child,
      idFn: () => 'run-3',
      nowFn: () => '2026-05-22T04:00:00.000Z'
    });

    const run = await runner.start({ commandType: 'go', targetName: 'demo' });

    expect(run).toMatchObject({ status: 'failed', exitCode: null, errorMessage: 'spawn claude ENOENT' });
    expect(finishedRuns).toHaveLength(1);
    expect(finishedRuns[0]).toMatchObject({ id: 'run-3', status: 'failed', exitCode: null, errorMessage: 'spawn claude ENOENT' });
    expect(fs.readFileSync(path.join(tmpDir, 'run-3.log'), 'utf8')).toContain('spawn claude ENOENT');
  });

  it('patch payload: run 对象 commandType 为 patch，targetName 为 crId', async () => {
    const createdRuns = [];
    const runner = createClaudeRunner({
      config: { claudeCommand: 'claude', claudeAssetsDir: 'H:/claude-assets', logsDir: tmpDir },
      store: { createRun: run => createdRuns.push(run), finishRun: () => {} },
      spawnFn: () => createProcess(0),
      idFn: () => 'run-patch-1',
      nowFn: () => '2026-05-22T04:00:00.000Z'
    });

    const run = await runner.start({
      commandType: 'patch',
      crId: 'cr-1',
      patchPhase: 'ia',
      agentRole: 'architect',
      projectName: 'demo',
      crPath: '/tmp/cr.md',
      iaOutputPath: '/tmp/ia.md',
      patchPlanPath: '/tmp/patch.md'
    });

    expect(run).toMatchObject({ commandType: 'patch', targetName: 'cr-1' });
    expect(createdRuns[0]).toMatchObject({ commandType: 'patch', targetName: 'cr-1' });
  });

  it('patch payload 缺少 crId 时 start() reject', async () => {
    const runner = createClaudeRunner({
      config: { claudeCommand: 'claude', claudeAssetsDir: 'H:/claude-assets', logsDir: tmpDir },
      store: { createRun: () => {}, finishRun: () => {} },
      spawnFn: () => createProcess(0),
      idFn: () => 'run-patch-err',
      nowFn: () => '2026-05-22T04:00:00.000Z'
    });

    await expect(runner.start({ commandType: 'patch' })).rejects.toThrow();
  });

  it('onComplete 回调在 run 完成后被调用一次，参数含 id/status/exitCode', async () => {
    const callbackCalls = [];
    const runner = createClaudeRunner({
      config: { claudeCommand: 'claude', claudeAssetsDir: 'H:/claude-assets', logsDir: tmpDir },
      store: { createRun: () => {}, finishRun: () => {} },
      spawnFn: () => createProcess(0),
      idFn: () => 'run-cb-1',
      nowFn: () => '2026-05-22T04:00:00.000Z'
    });

    await runner.start({
      commandType: 'go',
      targetName: 'demo',
      onComplete: result => callbackCalls.push(result)
    });

    expect(callbackCalls).toHaveLength(1);
    expect(callbackCalls[0]).toMatchObject({ id: 'run-cb-1', status: 'completed', exitCode: 0 });
  });
});
