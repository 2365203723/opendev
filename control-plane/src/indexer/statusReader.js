const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function toAgentRows(projectName, agents) {
  return Object.entries(agents || {}).map(([name, info]) => ({
    projectName,
    name,
    status: String(info.status || 'pending'),
    lastRun: info.lastRun || null,
    blockReason: info.blockReason || null
  }));
}

function toGateRows(projectName, gates) {
  return Object.entries(gates || {}).map(([name, status]) => ({
    projectName,
    name,
    status: String(status || 'pending'),
    evidencePath: null
  }));
}

function parseStatusFile(statusPath, projectRoot) {
  const content = fs.readFileSync(statusPath, 'utf8');
  const status = JSON.parse(content);
  const stat = fs.statSync(statusPath);
  const projectName = String(status.project || path.basename(projectRoot));
  const agents = toAgentRows(projectName, status.agents);
  const gates = toGateRows(projectName, status.gates);

  return {
    project: {
      name: projectName,
      rootPath: normalizePath(projectRoot),
      phase: String(status.phase || 'unknown'),
      complexity: status.complexity || 'unknown',
      reopenCount: Number(status.reopenCount || 0),
      updatedAt: status.updatedAt || new Date(stat.mtimeMs).toISOString()
    },
    agents,
    gates,
    artifacts: [
      {
        projectName,
        type: 'status',
        path: normalizePath(statusPath),
        hash: hashContent(content),
        mtimeMs: Math.trunc(stat.mtimeMs),
        summary: `phase=${String(status.phase || 'unknown')} gates=${gates.length} agents=${agents.length}`
      }
    ]
  };
}

function readProjectStatusFiles(projectsDir) {
  const normalizedProjectsDir = normalizePath(projectsDir);
  if (!fs.existsSync(projectsDir)) {
    return {
      projects: [],
      errors: [{ path: normalizedProjectsDir, message: 'projects directory does not exist' }]
    };
  }

  let entries;
  try {
    entries = fs.readdirSync(projectsDir, { withFileTypes: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'failed to read projects directory';
    return {
      projects: [],
      errors: [{ path: normalizedProjectsDir, message }]
    };
  }

  const projects = [];
  const errors = [];

  entries.filter(entry => entry.isDirectory()).forEach(entry => {
    const projectRoot = path.join(projectsDir, entry.name);
    const statusPath = path.join(projectRoot, '.status.json');
    if (!fs.existsSync(statusPath)) return;

    try {
      projects.push(parseStatusFile(statusPath, projectRoot));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed to parse status file';
      errors.push({ path: normalizePath(statusPath), message });
    }
  });

  return { projects, errors };
}

module.exports = { readProjectStatusFiles };
