const fs = require('fs');
const path = require('path');

const COMMANDS = new Set(['intake', 'go', 'recover', 'patch', 'memory']);
const SAFE_TARGET = /^[\p{L}\p{N}_-]+$/u;

function loadEthos(claudeAssetsDir) {
  try {
    const ethosPath = path.join(claudeAssetsDir, 'ETHOS.md');
    return fs.readFileSync(ethosPath, 'utf8').trim();
  } catch {
    return null;
  }
}

function buildPrompt({ claudeAssetsDir, commandType, targetName }) {
  const ethos = loadEthos(claudeAssetsDir);
  const core = `在 ${claudeAssetsDir} 中执行 /${commandType} ${targetName}。遵守项目 CLAUDE.md、governance 规则和 Codex 双审要求。`;
  if (!ethos) return core;
  return `${ethos}\n\n---\n\n${core}`;
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

function buildMemoryPrompt({ claudeAssetsDir, memoryPhase, scopeType, scopeId, outputPath, ...rest }) {
  if (!memoryPhase) {
    throw new Error('memoryPhase is required for memory command');
  }
  switch (memoryPhase) {
    case 'compress':
      return `[memory/compress] scope: ${scopeType}/${scopeId}，资产目录：${claudeAssetsDir}

你是记忆压缩 Agent。请完成以下任务：

## 输入

最近未处理的 Raw Events（JSON 数组）：
${rest.eventsJson}

已有 Episodes（JSON 数组，供参考去重）：
${rest.episodesJson}

## 任务

1. 将 Raw Events 分组为 Episodes（每个 Episode 对应一个有意义的阶段，如"一次 intake 完成"、"一次 CR 从提出到发布"）。
2. 从 Episodes 中提取 Facts（可复用事实，类型：user_preference / project_constraint / architecture_decision / delivery_fact / risk_fact / lesson_fact）。
3. 对每条 Fact 标注 confidence（0.0–1.0）、valid_from、expires_at（可为 null）、supersedes_id（若替代旧 Fact）。

## 输出格式

输出严格 JSON，写入以下路径，不输出其他内容：
OUTPUT_PATH: ${outputPath}

JSON 结构：
{
  "episodes": [{ "title": "...", "summary": "...", "eventIds": [...], "artifactPaths": [...], "conclusion": "...", "validFrom": "..." }],
  "facts": [{ "factType": "...", "content": "...", "sourceEventIds": [...], "sourcePaths": [...], "confidence": 0.9, "validFrom": "...", "expiresAt": null, "supersedesId": null }]
}`;
    case 'pack':
      return `[memory/pack] scope: ${scopeType}/${scopeId}，资产目录：${claudeAssetsDir}

你是 Retrieval Pack 生成 Agent。请为即将启动的 Runner 生成精准上下文包。

## 任务目标

${rest.taskGoal}

## 可用 Episodes（JSON 数组）

${rest.episodesJson}

## 可用 Facts（JSON 数组，仅 active 状态）

${rest.factsJson}

## 任务

从上述 Episodes 和 Facts 中选取与任务目标最相关的内容，生成 Retrieval Pack。
Pack 内容上限 4000 字符，必须包含：
1. 当前任务目标摘要。
2. 当前 scope 的关键状态（来自 delivery_fact / project_constraint）。
3. 最近相关 Episodes（最多 3 条）。
4. active Facts（按 confidence 降序，最多 10 条）。
5. 必须遵守的 governance 摘要（来自 architecture_decision）。
6. 明确排除的过期或被替代信息。

## 输出格式

输出严格 JSON，写入以下路径，不输出其他内容：
OUTPUT_PATH: ${outputPath}

JSON 结构：
{
  "taskGoal": "...",
  "keyStatus": "...",
  "recentEpisodes": [...],
  "activeFacts": [...],
  "governanceSummary": "...",
  "excludedInfo": "...",
  "episodeIds": [...],
  "factIds": [...]
}`;
    default:
      throw new Error(`unknown memoryPhase: ${memoryPhase}`);
  }
}

function buildScopeEnv({ scopeType, scopeId, productId, milestoneId, workstreamId, taskId, agentRole, projectName, acceptanceRef } = {}) {
  if (!scopeType && !scopeId) return undefined;

  const env = {};
  if (scopeType) env.PAPERCLIP_SCOPE_TYPE = scopeType;
  if (scopeId) env.PAPERCLIP_SCOPE_ID = scopeId;
  if (productId) env.PAPERCLIP_PRODUCT_ID = productId;
  if (milestoneId) env.PAPERCLIP_MILESTONE_ID = milestoneId;
  if (workstreamId) env.PAPERCLIP_WORKSTREAM_ID = workstreamId;
  if (taskId) env.PAPERCLIP_TASK_ID = taskId;
  if (agentRole) env.PAPERCLIP_AGENT_ROLE = agentRole;
  if (projectName) env.PAPERCLIP_PROJECT_NAME = projectName;
  if (acceptanceRef) env.PAPERCLIP_ACCEPTANCE_REF = acceptanceRef;

  return Object.keys(env).length > 0 ? env : undefined;
}

function buildClaudeCommand({ claudeCommand, claudeAssetsDir, commandType, targetName, crId, patchPhase, projectName, memoryPhase, scopeType, scopeId, productId, milestoneId, workstreamId, taskId, agentRole, acceptanceRef, dangerouslySkipPermissions, ...rest }) {
  if (!COMMANDS.has(commandType)) {
    throw new Error(`commandType must be one of: ${[...COMMANDS].join(', ')}`);
  }

  // 权限模式：bypass ON → 全跳过；bypass OFF → 自动批准编辑、拒绝危险操作
  const baseArgs = dangerouslySkipPermissions
    ? ['-p', '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose']
    : ['-p', '--permission-mode', 'acceptEdits', '--output-format', 'stream-json', '--verbose'];

  if (commandType === 'patch') {
    if (!crId) {
      throw new Error('crId is required for patch command');
    }
    const prompt = buildPatchPrompt({ claudeAssetsDir, crId, patchPhase, projectName, ...rest });
    const args = dangerouslySkipPermissions
      ? ['-p', prompt, '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose']
      : ['-p', prompt, '--permission-mode', 'acceptEdits', '--output-format', 'stream-json', '--verbose'];
    return { file: claudeCommand, args, prompt };
  }

  if (commandType === 'memory') {
    const prompt = buildMemoryPrompt({ claudeAssetsDir, memoryPhase, scopeType, scopeId, ...rest });
    const args = dangerouslySkipPermissions
      ? ['-p', prompt, '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose']
      : ['-p', prompt, '--permission-mode', 'acceptEdits', '--output-format', 'stream-json', '--verbose'];
    return { file: claudeCommand, args, prompt };
  }

  if (typeof targetName !== 'string' || !SAFE_TARGET.test(targetName)) {
    throw new Error('targetName must contain only letters, numbers, underscore, dash, and CJK characters');
  }

  const basePrompt = rest.prompt || buildPrompt({ claudeAssetsDir, commandType, targetName });
  const env = buildScopeEnv({ scopeType, scopeId, productId, milestoneId, workstreamId, taskId, agentRole, projectName, acceptanceRef });

  // --resume 模式：用已有 session 追加指令
  if (rest.resumeSessionId) {
    const args = dangerouslySkipPermissions
      ? ['-p', basePrompt, '--resume', rest.resumeSessionId, '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose']
      : ['-p', basePrompt, '--resume', rest.resumeSessionId, '--permission-mode', 'acceptEdits', '--output-format', 'stream-json', '--verbose'];
    return {
      file: claudeCommand,
      args,
      prompt: basePrompt,
      ...(env ? { env } : {})
    };
  }

  const args = dangerouslySkipPermissions
    ? ['-p', basePrompt, '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose']
    : ['-p', basePrompt, '--permission-mode', 'acceptEdits', '--output-format', 'stream-json', '--verbose'];
  return {
    file: claudeCommand,
    args,
    prompt: basePrompt,
    ...(env ? { env } : {})
  };
}

module.exports = { buildClaudeCommand };
