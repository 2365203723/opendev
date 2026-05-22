const fs = require('fs');
const path = require('path');

describe('public Web Console files', () => {
  it('ships the dashboard shell and avoids iframe-hostile scroll automation', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'index.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'styles.css'), 'utf8');

    expect(html).toContain('<main class="layout">');
    expect(html).toContain('id="rebuild-index"');
    expect(html).toContain('rel="icon"');
    expect(html).toContain('href="data:,"');
    expect(js).toContain('fetchJson');
    expect(js).not.toContain('scrollIntoView');
    expect(css).toContain('--color-primary: #1d9bf0');
    expect(css).toContain('text-wrap: pretty');
  });

  it('includes iteration center section with required ids', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'index.html'), 'utf8');

    expect(html).toContain('id="cr-section"');
    expect(html).toContain('id="cr-form"');
    expect(html).toContain('id="cr-list"');
  });

  it('includes memory center section with required ids', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'index.html'), 'utf8');

    expect(html).toContain('id="memory-section"');
    expect(html).toContain('id="memory-events-panel"');
    expect(html).toContain('id="memory-facts-panel"');
    expect(html).toContain('id="memory-pack-panel"');
    expect(html).toContain('id="memory-compress-btn"');
  });
});
