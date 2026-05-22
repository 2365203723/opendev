const { buildClaudeCommand } = require('../src/runner/commandBuilder');

describe('buildClaudeCommand', () => {
  it('builds a headless go command with JSON output', () => {
    const command = buildClaudeCommand({
      claudeCommand: 'claude',
      claudeAssetsDir: 'H:/claude-assets',
      commandType: 'go',
      targetName: 'demo-client'
    });

    expect(command).toEqual({
      file: 'claude',
      args: [
        '-p',
        '在 H:/claude-assets 中执行 /go demo-client。遵守项目 CLAUDE.md、governance 规则和 Codex 双审要求。',
        '--output-format',
        'json'
      ],
      prompt: '在 H:/claude-assets 中执行 /go demo-client。遵守项目 CLAUDE.md、governance 规则和 Codex 双审要求。'
    });
  });

  it('allows only intake, go, and recover command types', () => {
    expect(() => buildClaudeCommand({ claudeCommand: 'claude', claudeAssetsDir: 'H:/claude-assets', commandType: 'delete', targetName: 'demo' }))
      .toThrow('commandType must be intake, go, or recover');
  });

  it('rejects unsafe target names', () => {
    expect(() => buildClaudeCommand({ claudeCommand: 'claude', claudeAssetsDir: 'H:/claude-assets', commandType: 'go', targetName: '../demo' }))
      .toThrow('targetName must contain only letters, numbers, underscore, dash, and CJK characters');
    expect(() => buildClaudeCommand({ claudeCommand: 'claude', claudeAssetsDir: 'H:/claude-assets', commandType: 'go', targetName: 'demo;rm -rf /' }))
      .toThrow('targetName must contain only letters, numbers, underscore, dash, and CJK characters');
  });

  it.each([undefined, null])('rejects non-string target names: %s', targetName => {
    expect(() => buildClaudeCommand({ claudeCommand: 'claude', claudeAssetsDir: 'H:/claude-assets', commandType: 'go', targetName }))
      .toThrow('targetName must contain only letters, numbers, underscore, dash, and CJK characters');
  });

  // patch ia 阶段
  it('patch ia 阶段：返回 { file, args, prompt }，prompt 包含关键字段', () => {
    const result = buildClaudeCommand({
      claudeCommand: 'claude',
      claudeAssetsDir: 'H:/claude-assets',
      commandType: 'patch',
      crId: 'cr-abc',
      patchPhase: 'ia',
      agentRole: 'architect',
      projectName: 'demo',
      crPath: 'H:/claude-assets/cr.md',
      iaOutputPath: 'H:/claude-assets/ia.md',
      patchPlanPath: 'H:/claude-assets/patch.md'
    });

    expect(result).toHaveProperty('file');
    expect(result).toHaveProperty('args');
    expect(result).toHaveProperty('prompt');
    expect(result.prompt).toContain('cr-abc');
    expect(result.prompt).toContain('ia');
    expect(result.prompt).toContain('H:/claude-assets/ia.md');
    expect(result.prompt).toContain('H:/claude-assets/patch.md');
    expect(result.args).toContain('-p');
    expect(result.args).toContain('--output-format');
  });

  // patch execute 阶段
  it('patch execute 阶段：prompt 包含 patchPlanPath 和 iaPath', () => {
    const result = buildClaudeCommand({
      claudeCommand: 'claude',
      claudeAssetsDir: 'H:/claude-assets',
      commandType: 'patch',
      crId: 'cr-abc',
      patchPhase: 'execute',
      projectName: 'demo',
      patchPlanPath: 'H:/claude-assets/patch.md',
      iaPath: 'H:/claude-assets/ia.md'
    });

    expect(result.prompt).toContain('H:/claude-assets/patch.md');
    expect(result.prompt).toContain('H:/claude-assets/ia.md');
  });

  // patch regression 阶段
  it('patch regression 阶段：prompt 包含 testCommand', () => {
    const result = buildClaudeCommand({
      claudeCommand: 'claude',
      claudeAssetsDir: 'H:/claude-assets',
      commandType: 'patch',
      crId: 'cr-abc',
      patchPhase: 'regression',
      projectName: 'demo',
      testCommand: 'npm test'
    });

    expect(result.prompt).toContain('npm test');
  });

  // patch release 阶段
  it('patch release 阶段：prompt 包含 releaseNotePath', () => {
    const result = buildClaudeCommand({
      claudeCommand: 'claude',
      claudeAssetsDir: 'H:/claude-assets',
      commandType: 'patch',
      crId: 'cr-abc',
      patchPhase: 'release',
      projectName: 'demo',
      releaseNotePath: 'H:/claude-assets/release.md'
    });

    expect(result.prompt).toContain('H:/claude-assets/release.md');
  });

  // patch 缺少 crId → 抛错
  it('patch 缺少 crId → 抛错', () => {
    expect(() => buildClaudeCommand({
      claudeCommand: 'claude',
      claudeAssetsDir: 'H:/claude-assets',
      commandType: 'patch',
      patchPhase: 'ia',
      projectName: 'demo'
    })).toThrow('crId is required for patch command');
  });

  // patch 未知 patchPhase → 抛错
  it('patch 未知 patchPhase → 抛错', () => {
    expect(() => buildClaudeCommand({
      claudeCommand: 'claude',
      claudeAssetsDir: 'H:/claude-assets',
      commandType: 'patch',
      crId: 'cr-abc',
      patchPhase: 'unknown-phase',
      projectName: 'demo'
    })).toThrow('unknown patchPhase: unknown-phase');
  });

  // 回归：intake/go/recover 仍需要 targetName
  it('intake 缺少 targetName → 抛错（回归）', () => {
    expect(() => buildClaudeCommand({
      claudeCommand: 'claude',
      claudeAssetsDir: 'H:/claude-assets',
      commandType: 'intake'
    })).toThrow('targetName must contain only letters, numbers, underscore, dash, and CJK characters');
  });

  it('go 缺少 targetName → 抛错（回归）', () => {
    expect(() => buildClaudeCommand({
      claudeCommand: 'claude',
      claudeAssetsDir: 'H:/claude-assets',
      commandType: 'go'
    })).toThrow('targetName must contain only letters, numbers, underscore, dash, and CJK characters');
  });

  it('recover 缺少 targetName → 抛错（回归）', () => {
    expect(() => buildClaudeCommand({
      claudeCommand: 'claude',
      claudeAssetsDir: 'H:/claude-assets',
      commandType: 'recover'
    })).toThrow('targetName must contain only letters, numbers, underscore, dash, and CJK characters');
  });
});
