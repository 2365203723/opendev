const express = require('express');
const helmet = require('helmet');
const path = require('path');
const { readRecentLogs } = require('./indexer/logReader');
const { countLessonFiles } = require('./indexer/lessonReader');

function collectDashboard(store, config) {
  const projects = store.listProjects();
  const projectDetails = projects.map(project => ({
    project,
    agents: store.listAgents(project.name),
    gates: store.listGates(project.name)
  }));
  const activeAgents = projectDetails.flatMap(item => item.agents).filter(agent => agent.status === 'in_progress').length;
  const blockers = projectDetails.flatMap(item => item.agents
    .filter(agent => agent.status === 'blocked')
    .map(agent => ({ projectName: item.project.name, agent: agent.name, reason: agent.blockReason || 'blocked' }))
  );
  const failingGates = projectDetails.flatMap(item => item.gates
    .filter(gate => gate.status === 'fail' || gate.status === 'warning')
    .map(gate => ({ projectName: item.project.name, gate: gate.name, status: gate.status, evidencePath: gate.evidencePath }))
  );

  return {
    summary: {
      totalProjects: projects.length,
      activeAgents,
      blockedProjects: new Set(blockers.map(blocker => blocker.projectName)).size,
      lessonsCount: countLessonFiles(config.lessonsDir)
    },
    projects,
    blockers,
    failingGates,
    recentLogs: readRecentLogs(config.logsDir, 20),
    runs: store.listRuns(),
    timestamp: new Date().toISOString()
  };
}

function createApp(dependencies) {
  const app = express();
  const { config, store, indexer, runner } = dependencies;

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "script-src": ["'self'"],
        "style-src": ["'self'"],
        "img-src": ["'self'", 'data:']
      }
    }
  }));
  app.use(express.json({ limit: '64kb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'one-person-dev-company-control-plane', version: config.version });
  });

  app.post('/api/index/rebuild', (_req, res, next) => {
    try {
      res.json(indexer.rebuild());
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/dashboard', (_req, res, next) => {
    try {
      res.json(collectDashboard(store, config));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects', (_req, res, next) => {
    try {
      res.json({ projects: store.listProjects() });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:name', (req, res, next) => {
    try {
      const project = store.getProject(req.params.name);
      if (!project) {
        res.status(404).json({ error: 'project not found' });
        return;
      }
      res.json({
        project,
        agents: store.listAgents(project.name),
        gates: store.listGates(project.name),
        artifacts: store.listArtifacts(project.name)
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/runs', (_req, res, next) => {
    try {
      res.json({ runs: store.listRuns() });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/runs', async (req, res, next) => {
    try {
      if (!runner) {
        res.status(503).json({ error: 'runner unavailable' });
        return;
      }
      const run = await runner.start(req.body);
      res.status(202).json(run);
    } catch (error) {
      next(error);
    }
  });

  app.use((req, res) => {
    res.status(404).json({ error: `not found: ${req.method} ${req.path}` });
  });

  app.use((_err, _req, res, _next) => {
    res.status(500).json({ error: 'internal server error' });
  });

  return app;
}

module.exports = { createApp, collectDashboard };
