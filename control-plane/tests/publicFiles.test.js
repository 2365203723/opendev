const fs = require('fs');
const path = require('path');

describe('public Web Console files', () => {
  it('ships the dashboard shell and avoids iframe-hostile scroll automation', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'index.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'styles.css'), 'utf8');

    expect(html).toContain('<main class="layout">');
    expect(html).toContain('id="rebuild-index"');
    expect(js).toContain('fetchJson');
    expect(js).not.toContain('scrollIntoView');
    expect(css).toContain('--color-primary: #1d9bf0');
    expect(css).toContain('text-wrap: pretty');
  });
});
