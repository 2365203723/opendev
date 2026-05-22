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

function validateRunPayload(body) {
  if (!body || Object.prototype.toString.call(body) !== '[object Object]' || Object.getPrototypeOf(body) !== Object.prototype) {
    return { error: 'body must be a plain object' };
  }

  const allowedFields = new Set(['commandType', 'targetName']);
  const unknownField = Object.keys(body).find(field => !allowedFields.has(field));
  if (unknownField) {
    return { error: `unknown field: ${unknownField}` };
  }

  if (!['intake', 'go', 'recover'].includes(body.commandType)) {
    return { error: 'invalid commandType' };
  }

  if (typeof body.targetName !== 'string') {
    return { error: 'invalid targetName' };
  }

  const targetName = body.targetName.trim();
  if (targetName.length < 1 || targetName.length > 120 || !/^[\p{L}\p{N}_-]+$/u.test(targetName)) {
    return { error: 'invalid targetName' };
  }

  return { payload: { commandType: body.commandType, targetName } };
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
      const validation = validateRunPayload(req.body);
      if (validation.error) {
        res.status(400).json({ error: validation.error });
        return;
      }
      const run = await runner.start(validation.payload);
      res.status(202).json(run);
    } catch (error) {
      next(error);
    }
  });

  // CR CRUD routes
  const VALID_SOURCES = new Set(['user_input', 'qa_finding', 'online_issue', 'internal']);
  const VALID_SCOPES = new Set(['project', 'workstream', 'milestone']);
  const VALID_PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);

  async function triggerIa(crId, crStore, crRunner, crConfig) {
    if (!crRunner) return;
    const cr = crStore.getCr(crId);
    if (!cr) return;
    const techKeywords = ['架构', '数据模型', 'api', '安全', '数据库', 'schema', '接口', 'architecture', 'database', 'security'];
    const text = `${cr.title} ${cr.currentBehavior} ${cr.expectedBehavior}`.toLowerCase();
    const agentRole = techKeywords.some(k => text.includes(k)) ? 'architect' : 'pm';
    const crPath = `${crConfig.claudeAssetsDir}/cr-${crId}.md`;
    const iaOutputPath = `${crConfig.claudeAssetsDir}/ia-${crId}.md`;
    const patchPlanPath = `${crConfig.claudeAssetsDir}/patch-${crId}.md`;
    crStore.updateCrStatus(crId, { status: 'ia_running', updatedAt: new Date().toISOString() });
    try {
      const run = await crRunner.start({
        commandType: 'patch',
        crId,
        patchPhase: 'ia',
        agentRole,
        projectName: cr.projectName,
        crPath,
        iaOutputPath,
        patchPlanPath
      });
      crStore.updateCrStatus(crId, { status: 'ia_done', iaRunId: run.id, updatedAt: new Date().toISOString() });
      crStore.upsertCrDocument(crId, 'ia', iaOutputPath, 'Impact Analysis');
      crStore.upsertCrDocument(crId, 'patch_plan', patchPlanPath, 'Patch Plan');
    } catch {
      crStore.updateCrStatus(crId, { status: 'open', updatedAt: new Date().toISOString() });
    }
  }

  app.post('/api/change-requests', async (req, res, next) => {
    try {
      const { projectName, title, source, scope, currentBehavior, expectedBehavior, acceptanceCriteria, priority } = req.body || {};

      if (!title || typeof title !== 'string' || title.trim() === '') {
        res.status(400).json({ error: 'title is required' });
        return;
      }
      if (!source || !VALID_SOURCES.has(source)) {
        res.status(400).json({ error: 'source must be one of: user_input, qa_finding, online_issue, internal' });
        return;
      }
      if (!scope || !VALID_SCOPES.has(scope)) {
        res.status(400).json({ error: 'scope must be one of: project, workstream, milestone' });
        return;
      }
      if (!currentBehavior || typeof currentBehavior !== 'string' || currentBehavior.trim() === '') {
        res.status(400).json({ error: 'currentBehavior is required' });
        return;
      }
      if (!expectedBehavior || typeof expectedBehavior !== 'string' || expectedBehavior.trim() === '') {
        res.status(400).json({ error: 'expectedBehavior is required' });
        return;
      }
      if (!acceptanceCriteria || !Array.isArray(acceptanceCriteria) || acceptanceCriteria.length === 0) {
        res.status(400).json({ error: 'acceptanceCriteria must be a non-empty array' });
        return;
      }

      const resolvedPriority = priority || 'medium';
      if (!VALID_PRIORITIES.has(resolvedPriority)) {
        res.status(400).json({ error: 'priority must be one of: critical, high, medium, low' });
        return;
      }

      const project = store.getProject(projectName);
      if (!project) {
        res.status(404).json({ error: 'project not found' });
        return;
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const cr = {
        id,
        projectName,
        title: title.trim(),
        source,
        scope,
        currentBehavior: currentBehavior.trim(),
        expectedBehavior: expectedBehavior.trim(),
        acceptanceCriteria: JSON.stringify(acceptanceCriteria),
        priority: resolvedPriority,
        status: 'open',
        iaRunId: null,
        patchRunId: null,
        regressionRunId: null,
        createdAt: now,
        updatedAt: now
      };
      store.createCr(cr);

      setImmediate(() => triggerIa(id, store, runner, config));

      res.status(201).json(cr);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/change-requests', (req, res, next) => {
    try {
      const { projectName } = req.query;
      const changeRequests = store.listCrs(projectName);
      res.json({ changeRequests });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/change-requests/:id', (req, res, next) => {
    try {
      const cr = store.getCr(req.params.id);
      if (!cr) {
        res.status(404).json({ error: 'change request not found' });
        return;
      }
      const documents = store.listCrDocuments(req.params.id);
      res.json({ cr, documents });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/change-requests/:id/cancel', (req, res, next) => {
    try {
      const cr = store.getCr(req.params.id);
      if (!cr) {
        res.status(404).json({ error: 'change request not found' });
        return;
      }
      if (cr.status === 'released') {
        res.status(400).json({ error: 'cannot cancel a released change request' });
        return;
      }
      const now = new Date().toISOString();
      store.updateCrStatus(req.params.id, { status: 'cancelled', updatedAt: now });
      const updated = store.getCr(req.params.id);
      res.json(updated);
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
