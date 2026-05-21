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
      const chunks = [];
      const errors = [];

      child.stdout.on('data', data => {
        chunks.push(data);
        fs.appendFileSync(logPath, data);
      });
      child.stderr.on('data', data => {
        errors.push(data);
        fs.appendFileSync(logPath, data);
      });
      child.on('close', exitCode => {
        const stderr = Buffer.concat(errors).toString('utf8').trim();
        const status = exitCode === 0 ? 'completed' : 'failed';
        const finishedAt = nowFn();
        const finishedRun = {
          id,
          status,
          exitCode,
          errorMessage: stderr || null,
          finishedAt
        };
        store.finishRun(finishedRun);
        resolve({
          id,
          commandType: payload.commandType,
          targetName: payload.targetName,
          status,
          logPath,
          exitCode,
          errorMessage: stderr || null,
          startedAt,
          finishedAt
        });
      });
    })
  };
}

module.exports = { createClaudeRunner };
