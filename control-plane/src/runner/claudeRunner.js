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
    start: payload => new Promise(resolve => {
      const command = buildClaudeCommand({
        claudeCommand: config.claudeCommand,
        claudeAssetsDir: config.claudeAssetsDir,
        commandType: payload.commandType,
        targetName: payload.targetName
      });
      const id = idFn();
      const startedAt = nowFn();
      const logPath = path.join(config.logsDir, `${id}.log`).replace(/\\/g, '/');
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      store.createRun({
        id,
        commandType: payload.commandType,
        targetName: payload.targetName,
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
        resolve({
          id,
          commandType: payload.commandType,
          targetName: payload.targetName,
          status: finishedRun.status,
          logPath,
          exitCode: finishedRun.exitCode,
          errorMessage: finishedRun.errorMessage,
          startedAt,
          finishedAt: finishedRun.finishedAt
        });
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
