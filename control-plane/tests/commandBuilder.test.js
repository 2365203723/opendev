const { buildClaudeCommand } = require('../src/runner/commandBuilder');

describe('buildClaudeCommand', () => {
  it('builds a headless go command with JSON output', () => {
    const command = buildClaudeCommand({
      claudeCommand: 'claude',
      claudeAssetsDir: 'H:/claude-assets',
      commandType: 'go',
      targetName: 'demo-client'
    });

    expect(command.file).toBe('claude');
    expect(command.args).toContain('-p');
    expect(command.args).toContain('--output-format');
    expect(command.args).toContain('stream-json');
    expect(command.args).toContain('--verbose');
    // prompt 包含核心指令（ETHOS 可能被 prepend，只检查关键子串）
    expect(command.prompt).toContain('/go demo-client');
    expect(command.prompt).toContain('H:/claude-assets');
  });

  it('allows only intake, go, and recover command types', () => {
    expect(() => buildClaudeCommand({ claudeCommand: 'claude', claudeAssetsDir: 'H:/claude-assets', commandType: 'delete', targetName: 'demo' }))
      .toThrow('commandType must be one of:');
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

  // memory compress 阶段
  it('memory compress 阶段：返回 { file, args, prompt }，prompt 包含关键字段', () => {
    const result = buildClaudeCommand({
      claudeCommand: 'claude',
      claudeAssetsDir: 'H:/claude-assets',
      commandType: 'memory',
      memoryPhase: 'compress',
      scopeType: 'project',
      scopeId: 'demo',
      eventsJson: '[{"id":"e1"}]',
      episodesJson: '[]',
      outputPath: 'H:/claude-assets/memory-compress-out.json'
    });

    expect(result).toHaveProperty('file');
    expect(result).toHaveProperty('args');
    expect(result).toHaveProperty('prompt');
    expect(result.prompt).toContain('project');
    expect(result.prompt).toContain('demo');
    expect(result.prompt).toContain('compress');
    expect(result.prompt).toContain('[{"id":"e1"}]');
    expect(result.prompt).toContain('[]');
    expect(result.prompt).toContain('H:/claude-assets/memory-compress-out.json');
    expect(result.args).toContain('-p');
    expect(result.args).toContain('--output-format');
  });

  // memory pack 阶段
  it('memory pack 阶段：prompt 包含 taskGoal、episodesJson、factsJson、outputPath', () => {
    const result = buildClaudeCommand({
      claudeCommand: 'claude',
      claudeAssetsDir: 'H:/claude-assets',
      commandType: 'memory',
      memoryPhase: 'pack',
      scopeType: 'project',
      scopeId: 'demo',
      taskGoal: '执行 /go demo',
      episodesJson: '[{"id":"ep1"}]',
      factsJson: '[{"id":"f1"}]',
      outputPath: 'H:/claude-assets/memory-pack-out.json'
    });

    expect(result.prompt).toContain('执行 /go demo');
    expect(result.prompt).toContain('[{"id":"ep1"}]');
    expect(result.prompt).toContain('[{"id":"f1"}]');
    expect(result.prompt).toContain('H:/claude-assets/memory-pack-out.json');
  });

  // memory 缺少 memoryPhase → 抛错
  it('memory 缺少 memoryPhase → 抛错', () => {
    expect(() => buildClaudeCommand({
      claudeCommand: 'claude',
      claudeAssetsDir: 'H:/claude-assets',
      commandType: 'memory',
      scopeType: 'project',
      scopeId: 'demo'
    })).toThrow('memoryPhase is required for memory command');
  });

  // memory 未知 memoryPhase → 抛错
  it('memory 未知 memoryPhase → 抛错', () => {
    expect(() => buildClaudeCommand({
      claudeCommand: 'claude',
      claudeAssetsDir: 'H:/claude-assets',
      commandType: 'memory',
      memoryPhase: 'unknown-phase',
      scopeType: 'project',
      scopeId: 'demo'
    })).toThrow('unknown memoryPhase: unknown-phase');
  });
});

describe('buildClaudeCommand scope env injection', () => {
  it('injects PAPERCLIP_SCOPE_TYPE and PAPERCLIP_SCOPE_ID for project scope', () => {
    const result = buildClaudeCommand({
      claudeCommand: 'claude',
      claudeAssetsDir: 'H:/claude-assets',
      commandType: 'go',
      targetName: 'demo',
      scopeType: 'project',
      scopeId: 'demo',
      projectName: 'demo'
    });

    expect(result.env).toBeDefined();
    expect(result.env.PAPERCLIP_SCOPE_TYPE).toBe('project');
    expect(result.env.PAPERCLIP_SCOPE_ID).toBe('demo');
    expect(result.env.PAPERCLIP_PROJECT_NAME).toBe('demo');
  });

  it('injects workstream env for workstream scope', () => {
    const result = buildClaudeCommand({
      claudeCommand: 'claude',
      claudeAssetsDir: 'H:/claude-assets',
      commandType: 'go',
      targetName: 'demo',
      scopeType: 'workstream',
      scopeId: 'ws-001',
      workstreamId: 'ws-001',
      milestoneId: 'ms-001',
      productId: 'prod-001',
      agentRole: 'backend',
      projectName: 'demo'
    });

    expect(result.env.PAPERCLIP_SCOPE_TYPE).toBe('workstream');
    expect(result.env.PAPERCLIP_SCOPE_ID).toBe('ws-001');
    expect(result.env.PAPERCLIP_WORKSTREAM_ID).toBe('ws-001');
    expect(result.env.PAPERCLIP_MILESTONE_ID).toBe('ms-001');
    expect(result.env.PAPERCLIP_PRODUCT_ID).toBe('prod-001');
    expect(result.env.PAPERCLIP_AGENT_ROLE).toBe('backend');
    expect(result.env.PAPERCLIP_PROJECT_NAME).toBe('demo');
  });

  it('returns no env when no scope fields are provided', () => {
    const result = buildClaudeCommand({
      claudeCommand: 'claude',
      claudeAssetsDir: 'H:/claude-assets',
      commandType: 'go',
      targetName: 'demo'
    });

    expect(result.env).toBeUndefined();
  });
});
