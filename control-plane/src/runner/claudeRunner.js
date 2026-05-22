const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { buildClaudeCommand } = require('./commandBuilder');

function createClaudeRunner(options = {}) {
  const { config, store, spawnFn = spawn, idFn = crypto.randomUUID, nowFn = () => new Date().toISOString() } = options;
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

      let command;
      let targetName;
      if (payload.commandType === 'patch') {
        targetName = payload.crId;
        const prompt = `在 ${config.claudeAssetsDir} 中执行 /patch ${payload.crId}。phase=${payload.patchPhase} role=${payload.agentRole} project=${payload.projectName}。遵守项目 CLAUDE.md、governance 规则和 Codex 双审要求。`;
        command = {
          file: config.claudeCommand,
          args: ['-p', prompt, '--output-format', 'json'],
          prompt
        };
      } else {
        targetName = payload.targetName;
        command = buildClaudeCommand({
          claudeCommand: config.claudeCommand,
          claudeAssetsDir: config.claudeAssetsDir,
          commandType: payload.commandType,
          targetName
        });
      }

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

      const child = spawnFn(command.file, command.args, { cwd: config.claudeAssetsDir, shell: false });
      const errors = [];
      let isFinished = false;

      const finish = finishedRun => {
        if (isFinished) {
          return;
        }
        isFinished = true;
        store.finishRun(finishedRun);
        const runResult = {
          id,
          commandType: payload.commandType,
          targetName,
          status: finishedRun.status,
          logPath,
          exitCode: finishedRun.exitCode,
          errorMessage: finishedRun.errorMessage,
          startedAt,
          finishedAt: finishedRun.finishedAt
        };
        if (typeof payload.onComplete === 'function') {
          payload.onComplete(runResult);
        }
        resolve(runResult);
      };

      child.stdout.on('data', data => {
        fs.appendFileSync(logPath, data);
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
