const fs = require('fs');
const path = require('path');

describe('public Web Console files', () => {
  it('ships the current home shell and avoids iframe-hostile scroll automation', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'index.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'styles.css'), 'utf8');
    const tokens = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'design-tokens.css'), 'utf8');

    expect(html).toContain('<div class="home">');
    expect(html).toContain('id="main-input"');
    expect(html).toContain('id="main-submit"');
    expect(html).toContain('id="project-cards"');
    expect(html).toContain('id="settings-drawer"');
    expect(html).toContain('id="rebuild-index"');
    expect(html).toContain('rel="icon"');
    expect(html).toContain('href="data:,"');
    expect(html).toContain('id="run-detail-panel"');
    expect(html).toContain('id="run-transcript"');
    expect(html).toContain('id="run-status-bar"');
    expect(html).toContain('id="run-detail-overview"');
    expect(html).toContain('id="run-agent-timeline"');
    expect(html).toContain('id="run-tool-summary"');
    expect(html).toContain('id="run-transcript-filter"');
    expect(html).toContain('id="run-permission-actions"');
    expect(html).toContain('id="project-detail-view"');
    expect(html).toContain('id="project-detail-title"');
    expect(html).toContain('id="project-detail-summary"');
    expect(html).toContain('id="project-detail-agents"');
    expect(html).toContain('id="project-detail-runs"');
    expect(html).toContain('id="project-detail-gates"');
    expect(html).toContain('id="project-quality-panel"');
    expect(html).toContain('id="quality-gate-summary"');
    expect(html).toContain('id="quality-gate-list"');
    expect(html).toContain('id="quality-regression-actions"');
    expect(html).toContain('id="gate-fix-dialog"');
    expect(html).toContain('id="context-control-panel"');
    expect(html).toContain('id="context-scope-selector"');
    expect(html).toContain('id="context-pack-preview"');
    expect(html).toContain('id="context-facts-preview"');
    expect(html).toContain('id="context-compress-actions"');
    expect(html).toContain('id="launch-context-preview"');
    expect(html).toContain('id="iterate-context-preview"');
    expect(html).toContain('id="project-detail-artifacts"');
    expect(js).toContain('fetchJson');
    expect(js).toContain('loadHomePage');
    expect(js).toContain('openProjectDetail');
    expect(js).toContain('renderProjectDetail');
    expect(js).toContain('renderRunAgentTimeline');
    expect(js).toContain('normalizeGate');
    expect(js).toContain('openGateFixDialog');
    expect(js).toContain('loadContextPack');
    expect(js).toContain('triggerMemoryCompress');
    expect(js).toContain('applyTranscriptFilter');
    expect(js).toContain('openLaunchDialog');
    expect(js).not.toContain('scrollIntoView');
    expect(css).toContain('--primary:');
    expect(css).toContain('color-scheme: dark');
    expect(css).toContain('.project-detail-view');
    expect(css).toContain('.quality-gate-card');
    expect(css).toContain('.context-card');
    expect(css).toContain('.status-running');
    expect(tokens).toContain('--status-running-bg');
    expect(tokens).toContain('--panel-compact-padding');
  });

  it('includes pipeline and monitor sections with required ids', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'index.html'), 'utf8');

    expect(html).toContain('id="panel-pipeline"');
    expect(html).toContain('id="pipeline-projects"');
    expect(html).toContain('id="panel-monitor"');
    expect(html).toContain('id="approvals-list"');
    expect(html).toContain('id="agent-runs-list"');
    expect(html).toContain('id="log-stream-content"');
  });

  it('includes memory center section with required ids', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'index.html'), 'utf8');

    expect(html).toContain('id="panel-memory"');
    expect(html).toContain('id="memory-events-panel"');
    expect(html).toContain('id="memory-facts-panel"');
    expect(html).toContain('id="memory-pack-panel"');
    expect(html).toContain('id="memory-compress-btn"');
  });
});
