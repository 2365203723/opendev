const fs = require('fs');
const os = require('os');
const path = require('path');
const { countLessonFiles } = require('../src/indexer/lessonReader');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-reader-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('countLessonFiles', () => {
  it('counts markdown lesson files except the index', () => {
    fs.writeFileSync(path.join(tmpDir, 'INDEX.md'), '# index');
    fs.writeFileSync(path.join(tmpDir, 'backend.md'), '# backend');
    fs.writeFileSync(path.join(tmpDir, 'qa.md'), '# qa');
    fs.writeFileSync(path.join(tmpDir, 'raw.txt'), 'ignored');

    expect(countLessonFiles(tmpDir)).toBe(2);
  });

  it('returns zero when lessons directory is missing', () => {
    expect(countLessonFiles(path.join(tmpDir, 'missing'))).toBe(0);
  });
});
