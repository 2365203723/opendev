const fs = require('fs');
const path = require('path');

function createStatusWatcher({ projectsDir, writeEvent, triggerCompress, debounceMs = 500 }) {
  if (!projectsDir || !fs.existsSync(projectsDir)) {
    return null;
  }

  const timers = new Map();
  let watcher;

  try {
    watcher = fs.watch(projectsDir, { recursive: true }, (eventType, filename) => {
      if (!filename || !filename.endsWith('.status.json')) return;

      // 从路径提取 scopeId（项目名）
      const parts = filename.replace(/\\/g, '/').split('/');
      const scopeId = parts[0];
      if (!scopeId) return;

      const filePath = path.join(projectsDir, filename).replace(/\\/g, '/');

      // 防抖
      if (timers.has(filePath)) {
        clearTimeout(timers.get(filePath));
      }
      timers.set(filePath, setTimeout(() => {
        timers.delete(filePath);
        let content = '';
        try {
          content = fs.readFileSync(filePath, 'utf8');
        } catch { return; }

        writeEvent({
          eventType: 'file_changed',
          scopeType: 'project',
          scopeId,
          payload: { filePath, content },
          source: 'watcher',
          occurredAt: new Date().toISOString()
        });

        if (triggerCompress) {
          triggerCompress('project', scopeId);
        }
      }, debounceMs));
    });
  } catch {
    return null;
  }

  return {
    close() {
      timers.forEach(t => clearTimeout(t));
      timers.clear();
      if (watcher) {
        try { watcher.close(); } catch { /* ignore */ }
      }
    }
  };
}

module.exports = { createStatusWatcher };
