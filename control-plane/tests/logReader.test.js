const fs = require('fs');
const os = require('os');
const path = require('path');
const { readRecentLogs } = require('../src/indexer/logReader');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-reader-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('readRecentLogs', () => {
  it('returns newest log lines with level classification', () => {
    fs.writeFileSync(path.join(tmpDir, 'demo-backend-20260522-100000.log'), 'started\nERROR failed\n');
    fs.writeFileSync(path.join(tmpDir, 'demo-qa-20260522-110000.log'), 'PASS coverage\n');

    const logs = readRecentLogs(tmpDir, 3);

    expect(logs).toEqual([
      {
        file: 'demo-qa-20260522-110000.log',
        agent: 'qa',
        message: 'PASS coverage',
        level: 'info'
      },
      {
        file: 'demo-backend-20260522-100000.log',
        agent: 'backend',
        message: 'ERROR failed',
        level: 'error'
      },
      {
        file: 'demo-backend-20260522-100000.log',
        agent: 'backend',
        message: 'started',
        level: 'info'
      }
    ]);
  });

  it('returns a readable error for a missing logs directory', () => {
    const logs = readRecentLogs(path.join(tmpDir, 'missing'), 5);

    expect(logs).toEqual([]);
  });
});
