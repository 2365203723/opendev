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

  it('truncates messages to 160 characters', () => {
    const longMessage = 'x'.repeat(200);
    fs.writeFileSync(path.join(tmpDir, 'demo-backend-20260522-100000.log'), `${longMessage}\n`);

    const logs = readRecentLogs(tmpDir, 1);

    expect(logs[0].message).toHaveLength(160);
    expect(logs[0].message).toBe('x'.repeat(160));
  });

  it('returns only the last 3 lines from each file in reverse order', () => {
    fs.writeFileSync(path.join(tmpDir, 'demo-backend-20260522-100000.log'), 'line 1\nline 2\nline 3\nline 4\n');
    fs.writeFileSync(path.join(tmpDir, 'demo-qa-20260522-110000.log'), 'qa 1\nqa 2\nqa 3\nqa 4\n');

    const logs = readRecentLogs(tmpDir, 10);

    expect(logs.map(log => log.message)).toEqual([
      'qa 4',
      'qa 3',
      'qa 2',
      'line 4',
      'line 3',
      'line 2'
    ]);
  });

  it('classifies lines containing fail without error as error level', () => {
    fs.writeFileSync(path.join(tmpDir, 'demo-backend-20260522-100000.log'), 'deployment fail detected\n');

    const logs = readRecentLogs(tmpDir, 1);

    expect(logs[0].level).toBe('error');
  });

  it('returns a readable error for a missing logs directory', () => {
    const logs = readRecentLogs(path.join(tmpDir, 'missing'), 5);

    expect(logs).toEqual([]);
  });
});
