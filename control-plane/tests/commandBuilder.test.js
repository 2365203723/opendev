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
});
