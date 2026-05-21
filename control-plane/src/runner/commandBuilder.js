const COMMANDS = new Set(['intake', 'go', 'recover']);
const SAFE_TARGET = /^[\p{L}\p{N}_-]+$/u;

function buildPrompt({ claudeAssetsDir, commandType, targetName }) {
  return `在 ${claudeAssetsDir} 中执行 /${commandType} ${targetName}。遵守项目 CLAUDE.md、governance 规则和 Codex 双审要求。`;
}

function buildClaudeCommand({ claudeCommand, claudeAssetsDir, commandType, targetName }) {
  if (!COMMANDS.has(commandType)) {
    throw new Error('commandType must be intake, go, or recover');
  }
  if (!SAFE_TARGET.test(targetName)) {
    throw new Error('targetName must contain only letters, numbers, underscore, dash, and CJK characters');
  }

  const prompt = buildPrompt({ claudeAssetsDir, commandType, targetName });
  return {
    file: claudeCommand,
    args: ['-p', prompt, '--output-format', 'json'],
    prompt
  };
}

module.exports = { buildClaudeCommand };
