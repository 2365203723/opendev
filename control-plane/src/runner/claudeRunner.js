const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { buildClaudeCommand } = require('./commandBuilder');

// Sonnet 定价：input $3/1M tokens, output $15/1M tokens
const COST_INPUT_PER_M = 3.0;
const COST_OUTPUT_PER_M = 15.0;

function parseCostFromLog(logPath) {
  try {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n').reverse();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.usage && (msg.usage.input_tokens !== undefined || msg.usage.output_tokens !== undefined)) {
          return { tokenIn: msg.usage.input_tokens || 0, tokenOut: msg.usage.output_tokens || 0 };
        }
      } catch { /* 非 JSON 行 */ }
    }
  } catch { /* 文件不存在或读取失败 */ }
  return null;
}

function waitForApproval(store, approvalId, intervalMs, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const approval = store.getApproval(approvalId);
      if (!approval || approval.status !== 'pending') {
        clearInterval(timer);
        resolve(approval ? approval.status : 'rejected');
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        store.updateApprovalStatus(approvalId, 'rejected', 'timeout');
        resolve('rejected');
      }
    }, intervalMs);
  });
}

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}

function resolveCommand(command, platform, resolveCommandFn, fileExistsFn) {
  if (platform !== 'win32' || command !== 'claude') return command;

  const resolved = resolveCommandFn(command);
  if (!resolved) return command;

  const baseDir = normalizePath(path.dirname(resolved));
  const exePath = `${baseDir}/node_modules/@anthropic-ai/claude-code/bin/claude.exe`;
  return fileExistsFn(exePath) ? exePath : command;
}

function resolveCommandWithPath(command) {
  const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout.trim().split(/\r?\n/)[0] || null;
}

function createClaudeRunner(options = {}) {
  const {
    config,
    store,
    spawnFn = spawn,
    idFn = crypto.randomUUID,
    nowFn = () => new Date().toISOString(),
    platform = process.platform,
    resolveCommandFn = resolveCommandWithPath,
    fileExistsFn = fs.existsSync
  } = options;
  if (!config || !store) {
    return null;
  }

  return {
    start: payload => new Promise((resolve, reject) => {
      if (payload.commandType === 'patch') {
        if (!payload.crId) {
          return reject(new Error('patch commandType requires crId'));
        }
      }

      const targetName = payload.commandType === 'patch' ? payload.crId : payload.targetName;
      const command = buildClaudeCommand({
        claudeCommand: config.claudeCommand,
        claudeAssetsDir: config.claudeAssetsDir,
        commandType: payload.commandType,
        targetName,
        ...payload
      });

      const id = idFn();
      const startedAt = nowFn();
      const logPath = path.join(config.logsDir, `${id}.log`).replace(/\\/g, '/');
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      store.createRun({
        id,
        commandType: payload.commandType,
        targetName,
        status: 'running',
        prompt: command.prompt,
        logPath,
        startedAt
      });

      const executable = resolveCommand(command.file, platform, resolveCommandFn, fileExistsFn);
      const spawnOptions = {
        cwd: config.claudeAssetsDir,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ...(command.env || {}) }
      };
      const child = spawnFn(executable, command.args, spawnOptions);
      const errors = [];
      let isFinished = false;
      let sessionIdSaved = false;
      let awaitApprovalPending = false;

      const finish = async (finishedRun) => {
        if (isFinished) return;
        isFinished = true;

        const finishedAt = finishedRun.finishedAt || nowFn();
        const startMs = new Date(startedAt).getTime();
        const endMs = new Date(finishedAt).getTime();
        const durationMs = endMs - startMs;

        const usage = parseCostFromLog(logPath);
        let tokenIn = null, tokenOut = null, costCents = null;
        if (usage) {
          tokenIn = usage.tokenIn;
          tokenOut = usage.tokenOut;
          costCents = (tokenIn / 1_000_000) * COST_INPUT_PER_M * 100
                    + (tokenOut / 1_000_000) * COST_OUTPUT_PER_M * 100;
        }

        store.finishRun({
          ...finishedRun,
          finishedAt,
          durationMs,
          tokenIn,
          tokenOut,
          costCents
        });

        const runResult = {
          id,
          commandType: payload.commandType,
          targetName,
          status: finishedRun.status,
          logPath,
          exitCode: finishedRun.exitCode,
          errorMessage: finishedRun.errorMessage,
          startedAt,
          finishedAt
        };
        if (typeof payload.onComplete === 'function') {
          payload.onComplete(runResult);
        }
        resolve(runResult);
      };

      child.stdout.on('data', data => {
        fs.appendFileSync(logPath, data);

        if (!sessionIdSaved && typeof store.updateRunSessionId === 'function') {
          const text = data.toString('utf8');
          const lines = text.split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const msg = JSON.parse(line);
              if (msg.type === 'system' && msg.session_id) {
                store.updateRunSessionId(id, msg.session_id);
                sessionIdSaved = true;
                break;
              }
            } catch { /* 非 JSON 行，忽略 */ }
          }
        }

        // 检测 [AWAIT_APPROVAL]
        if (!awaitApprovalPending && typeof store.createApproval === 'function') {
          const text = data.toString('utf8');
          if (text.includes('[AWAIT_APPROVAL]')) {
            awaitApprovalPending = true;
            const approvalId = idFn();
            store.createApproval({
              id: approvalId,
              runId: id,
              promptSnapshot: text.slice(0, 4000),
              createdAt: nowFn()
            });

            // 暂停：等待审批结果（轮询 1s，超时 30min）
            waitForApproval(store, approvalId, 1000, 30 * 60 * 1000).then(status => {
              awaitApprovalPending = false;
              if (status === 'rejected') {
                child.kill();
                finish({
                  id,
                  status: 'failed',
                  exitCode: null,
                  errorMessage: 'approval rejected',
                  finishedAt: nowFn()
                });
              }
              // approved: 继续等待 child 正常结束
            });
          }
        }
      });

      child.stderr.on('data', data => {
        errors.push(data);
        fs.appendFileSync(logPath, data);
      });

      child.on('error', error => {
        fs.appendFileSync(logPath, `${error.message}\n`);
        finish({
          id,
          status: 'failed',
          exitCode: null,
          errorMessage: error.message,
          finishedAt: nowFn()
        });
      });

      child.on('close', exitCode => {
        if (isFinished) return;
        const stderr = Buffer.concat(errors).toString('utf8').trim();
        const status = exitCode === 0 ? 'completed' : 'failed';
        finish({
          id,
          status,
          exitCode,
          errorMessage: stderr || null,
          finishedAt: nowFn()
        });
      });
    })
  };
}

module.exports = { createClaudeRunner };
