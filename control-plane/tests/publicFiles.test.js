const fs = require('fs');
const path = require('path');

describe('public Web Console files', () => {
  it('ships the current home shell and avoids iframe-hostile scroll automation', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'index.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'styles.css'), 'utf8');

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
    expect(js).toContain('fetchJson');
    expect(js).toContain('loadHomePage');
    expect(js).toContain('openLaunchDialog');
    expect(js).not.toContain('scrollIntoView');
    expect(css).toContain('--primary:');
    expect(css).toContain('color-scheme: dark');
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
