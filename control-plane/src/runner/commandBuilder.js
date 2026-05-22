const COMMANDS = new Set(['intake', 'go', 'recover', 'patch']);
const SAFE_TARGET = /^[\p{L}\p{N}_-]+$/u;

function buildPrompt({ claudeAssetsDir, commandType, targetName }) {
  return `在 ${claudeAssetsDir} 中执行 /${commandType} ${targetName}。遵守项目 CLAUDE.md、governance 规则和 Codex 双审要求。`;
}

function buildPatchPrompt({ claudeAssetsDir, crId, patchPhase, projectName, ...rest }) {
  switch (patchPhase) {
    case 'ia':
      return `[patch/${crId}/ia] 项目：${projectName}，资产目录：${claudeAssetsDir}。\n分析变更请求 ${rest.crPath} 的影响范围（Impact Analysis）。\n输出 IA 文档至 ${rest.iaOutputPath}，输出 Patch Plan 至 ${rest.patchPlanPath}。\n禁止修改任何源代码。`;
    case 'execute':
      return `[patch/${crId}/execute] 项目：${projectName}，资产目录：${claudeAssetsDir}。\n按 Patch Plan（${rest.patchPlanPath}）执行变更，参考 IA 文档（${rest.iaPath}）。\n只做 Patch Plan 范围内的修改，不得超出。`;
    case 'regression':
      return `[patch/${crId}/regression] 项目：${projectName}，资产目录：${claudeAssetsDir}。\n运行全量测试命令：${rest.testCommand}。\n输出测试报告，标注通过/失败/跳过数量。`;
    case 'release':
      return `[patch/${crId}/release] 项目：${projectName}，资产目录：${claudeAssetsDir}。\n生成 Release Note 至 ${rest.releaseNotePath}。\n更新 .status.json 版本字段，并将本次经验追加至 lessons。`;
    default:
      throw new Error(`unknown patchPhase: ${patchPhase}`);
  }
}

function buildClaudeCommand({ claudeCommand, claudeAssetsDir, commandType, targetName, crId, patchPhase, projectName, ...rest }) {
  if (!COMMANDS.has(commandType)) {
    throw new Error('commandType must be intake, go, or recover');
  }

  if (commandType === 'patch') {
    if (!crId) {
      throw new Error('crId is required for patch command');
    }
    const prompt = buildPatchPrompt({ claudeAssetsDir, crId, patchPhase, projectName, ...rest });
    return {
      file: claudeCommand,
      args: ['-p', prompt, '--output-format', 'json'],
      prompt
    };
  }

  if (typeof targetName !== 'string' || !SAFE_TARGET.test(targetName)) {
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
