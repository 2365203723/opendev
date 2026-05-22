const fs = require('fs');
const path = require('path');

function detectAgent(file) {
  const parts = file.replace(/\.log$/, '').split('-');
  return parts.length >= 3 ? parts[parts.length - 3] : 'unknown';
}

function classifyLine(line) {
  return line.toLowerCase().includes('error') || line.toLowerCase().includes('fail') ? 'error' : 'info';
}

function readRecentLogs(logsDir, limit) {
  if (!fs.existsSync(logsDir)) return [];

  return fs.readdirSync(logsDir)
    .filter(file => file.endsWith('.log'))
    .sort()
    .reverse()
    .flatMap(file => {
      const content = fs.readFileSync(path.join(logsDir, file), 'utf8');
      return content.split('\n')
        .filter(Boolean)
        .slice(-3)
        .reverse()
        .map(line => ({
          file,
          agent: detectAgent(file),
          message: line.slice(0, 160),
          level: classifyLine(line)
        }));
    })
    .slice(0, limit);
}

module.exports = { readRecentLogs };
