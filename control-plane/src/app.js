const express = require('express');
const helmet = require('helmet');
const path = require('path');
const { readRecentLogs } = require('./indexer/logReader');
const { countLessonFiles } = require('./indexer/lessonReader');
const { createStatusWatcher } = require('./indexer/statusWatcher');
const { buildClaudeCommand } = require('./runner/commandBuilder');
const { createConcurrencyControl } = require('./concurrencyControl');
const { parseStreamLine, extractDisplayEvents } = require('./runner/streamParser');

// ─── memory helpers ───────────────────────────────────────────────────────────

function writeEvent(store, { eventType, scopeType, scopeId, payload, source, occurredAt }) {
  if (!store || typeof store.createRawEvent !== 'function') return null;
  const id = crypto.randomUUID();
  try {
    store.createRawEvent({
      id,
      eventType,
      scopeType,
      scopeId,
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
      source,
      occurredAt: occurredAt || new Date().toISOString()
    });
  } catch { return null; }
  return id;
}

async function triggerCompress(scopeType, scopeId, store, runner, config) {
  if (!runner) return;
  const runs = store.listRuns();
  const running = runs.find(r =>
    r.commandType === 'memory' &&
    r.status === 'running' &&
    r.targetName === `${scopeType}/${scopeId}` &&
    (Date.now() - new Date(r.startedAt).getTime()) < 10 * 60 * 1000
  );
  if (running) return;
  const events = store.listRawEvents({ scopeType, scopeId, limit: 50, offset: 0 });
  const episodes = store.listEpisodes({ scopeType, scopeId, limit: 20, offset: 0 });
  const outputPath = `${config.claudeAssetsDir}/memory-compress-${scopeType}-${scopeId}-${Date.now()}.json`;
  try {
    await runner.start({
      commandType: 'memory',
      memoryPhase: 'compress',
      scopeType,
      scopeId,
      eventsJson: JSON.stringify(events),
      episodesJson: JSON.stringify(episodes),
      outputPath,
      targetName: `${scopeType}/${scopeId}`,
      onComplete: (result) => handleCompressComplete(result, scopeType, scopeId, outputPath, store, runner, config)
    });
  } catch { /* 静默失败 */ }
}

function handleCompressComplete(result, scopeType, scopeId, outputPath, store, runner, config) {
  if (result.status !== 'completed') return;
  let parsed;
  try {
    const fs = require('fs');
    parsed = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  } catch { return; }
  const now = new Date().toISOString();
  (parsed.episodes || []).forEach(ep => {
    store.createEpisode({
      id: crypto.randomUUID(),
      scopeType,
      scopeId,
      title: ep.title || '',
      summary: ep.summary || '',
      eventIds: JSON.stringify(ep.eventIds || []),
      artifactPaths: JSON.stringify(ep.artifactPaths || []),
      conclusion: ep.conclusion || '',
      generatedByRunId: result.id,
      validFrom: ep.validFrom || now
    });
  });
  (parsed.facts || []).forEach(fact => {
    store.createFact({
      id: crypto.randomUUID(),
      factType: fact.factType || 'delivery_fact',
      scopeType,
      scopeId,
      content: fact.content || '',
      sourceEventIds: JSON.stringify(fact.sourceEventIds || []),
      sourcePaths: JSON.stringify(fact.sourcePaths || []),
      confidence: fact.confidence ?? 1.0,
      validFrom: fact.validFrom || now,
      expiresAt: fact.expiresAt || null,
      supersedesId: fact.supersedesId || null,
      status: 'active',
      generatedByRunId: result.id
    });
  });
  setImmediate(() => triggerPack(scopeType, scopeId, null, store, runner, config));
}

async function triggerPack(scopeType, scopeId, taskGoal, store, runner, config) {
  if (!runner) return;
  const episodes = store.listEpisodes({ scopeType, scopeId, limit: 10, offset: 0 });
  const facts = store.listFacts({ scopeType, scopeId, status: 'active', limit: 50, offset: 0 });
  const outputPath = `${config.claudeAssetsDir}/memory-pack-${scopeType}-${scopeId}-${Date.now()}.json`;
  try {
    await runner.start({
      commandType: 'memory',
      memoryPhase: 'pack',
      scopeType,
      scopeId,
      taskGoal: taskGoal || `scope: ${scopeType}/${scopeId} 的最新上下文`,
      episodesJson: JSON.stringify(episodes),
      factsJson: JSON.stringify(facts),
      outputPath,
      targetName: `${scopeType}/${scopeId}`,
      onComplete: (result) => handlePackComplete(result, scopeType, scopeId, outputPath, store)
    });
  } catch { /* 静默失败 */ }
}

function handlePackComplete(result, scopeType, scopeId, outputPath, store) {
  if (result.status !== 'completed') return;
  let parsed;
  try {
    const fs = require('fs');
    parsed = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  } catch { return; }
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  store.upsertRetrievalPack({
    id: crypto.randomUUID(),
    scopeType,
    scopeId,
    runId: result.id,
    content: JSON.stringify(parsed),
    episodeIds: JSON.stringify(parsed.episodeIds || []),
    factIds: JSON.stringify(parsed.factIds || []),
    generatedAt: now,
    expiresAt
  });
}

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
    .map(gate => ({ projectName: item.project.name, gate: gate.name || gate.gateName, status: gate.status, evidencePath: gate.evidencePath }))
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

  const allowedFields = new Set(['commandType', 'targetName', 'scopeType', 'scopeId', 'projectPath', 'workstreamId', 'taskId', 'isReadOnly', 'prompt']);
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

  const payload = { commandType: body.commandType, targetName };
  ['scopeType', 'scopeId', 'projectPath', 'workstreamId', 'taskId'].forEach(field => {
    if (body[field] !== undefined) payload[field] = body[field];
  });
  if (body.isReadOnly !== undefined) payload.isReadOnly = body.isReadOnly === true;
  if (body.prompt !== undefined) payload.prompt = String(body.prompt);
  return { payload };
}

function createApp(dependencies) {
  const app = express();
  const { config, store, indexer, runner, watcherFactory } = dependencies;
  const concurrency = dependencies.concurrency || createConcurrencyControl();

  // 启动文件系统 watcher（可通过 watcherFactory 注入 mock）
  const factory = watcherFactory !== undefined ? watcherFactory : createStatusWatcher;
  const statusWatcher = factory ? factory({
    projectsDir: config.projectsDir,
    writeEvent: (event) => writeEvent(store, event),
    triggerCompress: (scopeType, scopeId) => triggerCompress(scopeType, scopeId, store, runner, config),
    debounceMs: 500
  }) : null;

  app.close = function () {
    if (statusWatcher) {
      try { statusWatcher.close(); } catch { /* ignore */ }
    }
  };

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", 'data:']
      }
    }
  }));
  app.use(express.json({ limit: '64kb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'one-person-dev-company-control-plane', version: config.version });
  });

  // ── CLI 检测 (M2) ────────────────────────────────────────────────────────────

  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  const isWin = process.platform === 'win32';

  const CLI_DEFS = [
    { key: 'claude',    name: 'Claude Code', icon: '🤖', desc: 'Anthropic official CLI',  versionCmd: '--version' },
    { key: 'codex',     name: 'Codex CLI',   icon: '🔷', desc: 'OpenAI official CLI',     versionCmd: '--version' },
    { key: 'gemini',    name: 'Gemini CLI',  icon: '🔵', desc: 'Google official CLI',     versionCmd: '--version' },
    { key: 'opencode',  name: 'OpenCode',    icon: '⬜', desc: 'Open-source agent CLI',   versionCmd: '--version' },
  ];

  async function detectOneCLI(def) {
    try {
      const whichCmd = isWin ? `where ${def.key}` : `which ${def.key}`;
      const { stdout: pathOut } = await execAsync(whichCmd, { timeout: 4000 });
      const binPath = pathOut.trim().split(/\r?\n/)[0].trim();
      if (!binPath) return null;

      let version = '已安装';
      try {
        const { stdout: verOut } = await execAsync(`${def.key} ${def.versionCmd}`, { timeout: 6000 });
        const raw = verOut.trim().split(/\r?\n/)[0];
        // 提取第一个版本号（x.y.z 格式）或完整首行
        const match = raw.match(/\d+\.\d+[\.\d]*/);
        version = match ? match[0] : (raw.slice(0, 30) || '已安装');
      } catch { /* 保持"已安装" */ }

      return { key: def.key, name: def.name, icon: def.icon, desc: def.desc, version, path: binPath };
    } catch {
      return null;
    }
  }

  let cliCache = null;
  let cliCacheAt = 0;
  const CLI_CACHE_TTL = 60000;

  async function scanAllCLIs() {
    const results = await Promise.all(CLI_DEFS.map(detectOneCLI));
    return results.filter(Boolean);
  }

  app.get('/api/clis', async (_req, res, next) => {
    try {
      if (cliCache && Date.now() - cliCacheAt < CLI_CACHE_TTL) {
        return res.json({ clis: cliCache });
      }
      cliCache = await scanAllCLIs();
      cliCacheAt = Date.now();
      res.json({ clis: cliCache });
    } catch (e) { next(e); }
  });

  app.post('/api/clis/rescan', async (_req, res, next) => {
    try {
      cliCache = await scanAllCLIs();
      cliCacheAt = Date.now();
      res.json({ clis: cliCache });
    } catch (e) { next(e); }
  });

  app.post('/api/clis/:key/test', async (req, res, next) => {
    const def = CLI_DEFS.find(d => d.key === req.params.key);
    if (!def) return res.status(404).json({ error: 'unknown CLI' });
    try {
      const { stdout } = await execAsync(`${def.key} ${def.versionCmd}`, { timeout: 8000 });
      res.json({ ok: true, output: stdout.trim().slice(0, 200) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── BYOK Key 管理 (M3) ───────────────────────────────────────────────────────

  const byok = require('./byok');
  const https = require('https');

  app.get('/api/byok/keys', (_req, res) => {
    res.json({ keys: byok.listKeys() });
  });

  app.post('/api/byok/keys', (req, res) => {
    const { provider, key } = req.body || {};
    if (!provider || !key) return res.status(400).json({ error: 'provider and key required' });
    try {
      byok.setKey(provider, key.trim());
      res.json({ ok: true, maskedKey: byok.maskKey(key.trim()) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/byok/keys/:provider', (req, res) => {
    try {
      byok.deleteKey(req.params.provider);
      res.json({ ok: true });
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });

  app.post('/api/byok/:provider/test', async (req, res) => {
    const key = byok.getKey(req.params.provider);
    if (!key) return res.status(400).json({ ok: false, error: '未配置该 provider 的 API Key' });

    try {
      const result = await testProviderKey(req.params.provider, key);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  async function testProviderKey(provider, key) {
    const info = byok.PROVIDERS[provider];
    if (!info) throw new Error('Unknown provider');

    if (provider === 'anthropic') {
      return new Promise((resolve, reject) => {
        const body = JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 16,
          messages: [{ role: 'user', content: 'reply: ok' }]
        });
        const opts = {
          hostname: 'api.anthropic.com',
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body)
          }
        };
        const req = https.request(opts, r => {
          let data = '';
          r.on('data', d => { data += d; });
          r.on('end', () => {
            if (r.statusCode === 200) resolve({ ok: true, model: 'claude-haiku-4-5-20251001' });
            else {
              try { reject(new Error(JSON.parse(data).error?.message || `HTTP ${r.statusCode}`)); }
              catch { reject(new Error(`HTTP ${r.statusCode}`)); }
            }
          });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
        req.write(body);
        req.end();
      });
    }

    if (provider === 'openai' || provider === 'deepseek') {
      const baseHost = provider === 'deepseek' ? 'api.deepseek.com' : 'api.openai.com';
      return new Promise((resolve, reject) => {
        const body = JSON.stringify({
          model: provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini',
          max_tokens: 16,
          messages: [{ role: 'user', content: 'reply: ok' }]
        });
        const opts = {
          hostname: baseHost,
          path: '/v1/chat/completions',
          method: 'POST',
          headers: {
            'authorization': `Bearer ${key}`,
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body)
          }
        };
        const req = https.request(opts, r => {
          let data = '';
          r.on('data', d => { data += d; });
          r.on('end', () => {
            if (r.statusCode === 200) resolve({ ok: true, model: JSON.parse(data).model });
            else {
              try { reject(new Error(JSON.parse(data).error?.message || `HTTP ${r.statusCode}`)); }
              catch { reject(new Error(`HTTP ${r.statusCode}`)); }
            }
          });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
        req.write(body);
        req.end();
      });
    }

    throw new Error('No test implementation for this provider');
  }

  // ── BYOK SSE 代理 (M3) ───────────────────────────────────────────────────────
  // 轻量对话模式：无工具调用，纯文本生成，供无 CLI 场景使用

  app.post('/api/proxy/stream', async (req, res) => {
    const { provider = 'anthropic', prompt, model } = req.body || {};
    const key = byok.getKey(provider);
    if (!key) return res.status(400).json({ error: '未配置该 provider 的 API Key' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      if (provider === 'anthropic') {
        await streamAnthropic({ key, prompt, model: model || 'claude-sonnet-4-6', send });
      } else if (provider === 'openai' || provider === 'deepseek') {
        await streamOpenAI({ key, provider, prompt, model, send });
      } else {
        send({ error: 'unsupported provider' });
      }
    } catch (e) {
      send({ error: e.message });
    }

    send({ done: true, status: 'completed' });
    res.end();
  });

  function streamAnthropic({ key, prompt, model, send }) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model,
        max_tokens: 4096,
        stream: true,
        messages: [{ role: 'user', content: prompt }]
      });
      const opts = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body)
        }
      };
      const req = https.request(opts, r => {
        let buf = '';
        r.on('data', chunk => {
          buf += chunk.toString();
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') continue;
            try {
              const ev = JSON.parse(raw);
              if (ev.type === 'content_block_delta' && ev.delta?.text) {
                send({ text: ev.delta.text });
              }
            } catch { /* ignore parse errors */ }
          }
        });
        r.on('end', resolve);
        r.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(120000, () => { req.destroy(); reject(new Error('request timeout')); });
      req.write(body);
      req.end();
    });
  }

  function streamOpenAI({ key, provider, prompt, model, send }) {
    const host = provider === 'deepseek' ? 'api.deepseek.com' : 'api.openai.com';
    const defaultModel = provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o';
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model: model || defaultModel,
        max_tokens: 4096,
        stream: true,
        messages: [{ role: 'user', content: prompt }]
      });
      const opts = {
        hostname: host,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'authorization': `Bearer ${key}`,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body)
        }
      };
      const req = https.request(opts, r => {
        let buf = '';
        r.on('data', chunk => {
          buf += chunk.toString();
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') continue;
            try {
              const ev = JSON.parse(raw);
              const text = ev.choices?.[0]?.delta?.content;
              if (text) send({ text });
            } catch { /* ignore */ }
          }
        });
        r.on('end', resolve);
        r.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(120000, () => { req.destroy(); reject(new Error('request timeout')); });
      req.write(body);
      req.end();
    });
  }

  // ── Skill / MCP 商店 (M5) ────────────────────────────────────────────────────

  const skills = require('./skills');

  app.get('/api/skills', (_req, res) => res.json({ skills: skills.listSkills() }));
  app.post('/api/skills/:key/install', (req, res) => {
    try { skills.installSkill(req.params.key); res.json({ ok: true }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.delete('/api/skills/:key', (req, res) => {
    skills.uninstallSkill(req.params.key); res.json({ ok: true });
  });

  app.get('/api/mcps', (_req, res) => res.json({ mcps: skills.listMcps() }));
  app.post('/api/mcps/:key/install', (req, res) => {
    try { skills.installMcp(req.params.key); res.json({ ok: true }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.delete('/api/mcps/:key', (req, res) => {
    skills.uninstallMcp(req.params.key); res.json({ ok: true });
  });

  // ── 意图分类 (M4) ────────────────────────────────────────────────────────────

  const intent = require('./intent');

  app.post('/api/intent/classify', (req, res) => {
    const { prompt } = req.body || {};
    res.json(intent.classify(prompt));
  });

  app.post('/api/index/rebuild', (_req, res, next) => {
    try {
      const result = indexer.rebuild();
      if (store) {
        writeEvent(store, {
          eventType: 'command_run',
          scopeType: 'company',
          scopeId: 'default',
          payload: { action: 'index_rebuild', indexedProjects: result.indexedProjects },
          source: 'control_plane'
        });
      }
      res.json(result);
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

  app.get('/api/locks', (_req, res) => {
    res.json(concurrency.getLockStatus());
  });

  // 追加指令：用 --resume 启动新进程注入追加指令
  app.post('/api/runs/:id/resume', async (req, res, next) => {
    try {
      const run = store.listRuns().find(r => r.id === req.params.id);
      if (!run) {
        res.status(404).json({ error: 'run not found' });
        return;
      }
      if (!run.sessionId) {
        res.status(400).json({ error: 'run has no session_id, cannot resume' });
        return;
      }
      const { message } = req.body || {};
      if (!message || typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: 'message is required' });
        return;
      }
      if (!runner) {
        res.status(503).json({ error: 'runner unavailable' });
        return;
      }

      res.status(202).json({ status: 'queued', sessionId: run.sessionId });

      setImmediate(async () => {
        try {
          await runner.start({
            commandType: run.commandType,
            targetName: run.targetName,
            prompt: message.trim(),
            resumeSessionId: run.sessionId
          });
        } catch { /* 静默失败 */ }
      });
    } catch (error) {
      next(error);
    }
  });

  // SSE 实时日志流
  app.get('/api/runs/:id/stream', (req, res) => {
    const run = store.listRuns().find(r => r.id === req.params.id);
    if (!run || !run.logPath) {
      res.status(404).json({ error: 'run not found' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const fs = require('fs');
    let offset = 0;
    let lineBuffer = '';

    function sendDisplayEvents(events) {
      for (const ev of events) {
        res.write(`data: ${JSON.stringify(ev)}\n\n`);
      }
    }

    function processNewBytes() {
      try {
        const stat = fs.statSync(run.logPath);
        if (stat.size <= offset) return;
        const buf = Buffer.alloc(stat.size - offset);
        const fd = fs.openSync(run.logPath, 'r');
        fs.readSync(fd, buf, 0, buf.length, offset);
        fs.closeSync(fd);
        offset = stat.size;
        lineBuffer += buf.toString('utf8');
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop();
        for (const line of lines) {
          const parsed = parseStreamLine(line);
          if (!parsed) continue;
          const events = extractDisplayEvents(parsed);
          sendDisplayEvents(events);
        }
      } catch { /* 文件未创建，忽略 */ }
    }

    processNewBytes();
    const interval = setInterval(processNewBytes, 300);

    function checkDone() {
      const current = store.listRuns().find(r => r.id === req.params.id);
      if (current && current.status !== 'running') {
        processNewBytes();
        if (lineBuffer.trim()) {
          const parsed = parseStreamLine(lineBuffer);
          if (parsed) sendDisplayEvents(extractDisplayEvents(parsed));
          lineBuffer = '';
        }
        res.write(`data: ${JSON.stringify({ kind: 'done', status: current.status })}\n\n`);
        clearInterval(interval);
        clearInterval(doneCheck);
        res.end();
      }
    }
    const doneCheck = setInterval(checkDone, 500);

    req.on('close', () => {
      clearInterval(interval);
      clearInterval(doneCheck);
    });
  });

  app.post('/api/runs', async (req, res, next) => {
    try {
      const validation = validateRunPayload(req.body);
      if (validation.error) {
        res.status(400).json({ error: validation.error });
        return;
      }

      const runPayload = { ...validation.payload };

      const lockId = `run:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      const scope = {
        scopeType: runPayload.scopeType || 'project',
        projectPath: runPayload.projectPath,
        workstreamId: runPayload.workstreamId,
        taskId: runPayload.taskId
      };
      const shouldLock = Boolean(scope.projectPath || scope.workstreamId);
      if (shouldLock) {
        const lock = concurrency.tryAcquire(lockId, scope, runPayload.isReadOnly === true);
        if (!lock.success) {
          res.status(409).json({ error: lock.reason });
          return;
        }
      }

      if (!runner) {
        if (shouldLock) concurrency.release(lockId, scope);
        res.status(503).json({ error: 'runner unavailable' });
        return;
      }

      // 注入 Retrieval Pack
      let packContext = '';
      if (store && typeof store.getLatestRetrievalPack === 'function') {
        const pack = store.getLatestRetrievalPack('company', 'default');
        if (pack) {
          try {
            const packContent = typeof pack.content === 'string' ? pack.content : JSON.stringify(pack.content);
            const truncated = packContent.length > 4000 ? packContent.slice(0, 4000) + '...[truncated]' : packContent;
            packContext = `\n\n## Retrieval Pack（上下文记忆）\n\n${truncated}`;
          } catch { /* 静默失败 */ }
        }
      }

      if (packContext) {
        try {
          const command = buildClaudeCommand({
            claudeCommand: '',
            claudeAssetsDir: config.claudeAssetsDir || '',
            commandType: runPayload.commandType,
            targetName: runPayload.targetName
          });
          runPayload.prompt = command.prompt + packContext;
        } catch { /* 静默失败，不注入 */ }
      }

      res.status(202).json({ status: 'queued', commandType: runPayload.commandType, targetName: runPayload.targetName });

      setImmediate(async () => {
        try {
          const run = await runner.start(runPayload);
          if (store) {
            writeEvent(store, {
              eventType: 'command_run',
              scopeType: 'company',
              scopeId: 'default',
              payload: { runId: run.id, commandType: runPayload.commandType, targetName: runPayload.targetName, status: run.status, exitCode: run.exitCode },
              source: 'control_plane'
            });
          }
        } catch { /* runner errors are logged to run record */ }
        finally {
          if (shouldLock) {
            concurrency.release(lockId, scope);
          }
        }
      });
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
      const fromStatus = cr.status;
      const crId = req.params.id;
      const now = new Date().toISOString();
      store.updateCrStatus(crId, { status: 'cancelled', updatedAt: now });
      writeEvent(store, {
        eventType: 'agent_run',
        scopeType: 'cr',
        scopeId: crId,
        payload: { crId, fromStatus, toStatus: 'cancelled' },
        source: 'control_plane'
      });
      const updated = store.getCr(crId);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  // ---------------------------------------------------------------------------
  // execute-patch / trigger-regression state machine helpers
  // ---------------------------------------------------------------------------

  function executePatchComplete(runResult, crId, crStore, crRunner, crConfig) {
    if (runResult.status === 'completed') {
      crStore.updateCrStatus(crId, { status: 'regression_running', patchRunId: runResult.id, updatedAt: new Date().toISOString() });
      triggerRegressionInternal(crId, crStore, crRunner, crConfig);
    } else {
      crStore.updateCrStatus(crId, { status: 'patch_pending', patchRunId: runResult.id, updatedAt: new Date().toISOString() });
    }
  }

  async function triggerRegressionInternal(crId, crStore, crRunner, crConfig) {
    if (!crRunner) return;
    const cr = crStore.getCr(crId);
    if (!cr) return;
    const testCommand = `npm --prefix "${crConfig.claudeAssetsDir}/control-plane" run test:coverage`;
    const releaseNotePath = `${crConfig.claudeAssetsDir}/release-${crId}.md`;
    try {
      await crRunner.start({
        commandType: 'patch',
        crId,
        patchPhase: 'regression',
        projectName: cr.projectName,
        testCommand,
        onComplete: (regressionResult) => regressionComplete(regressionResult, crId, crStore, releaseNotePath)
      });
    } catch {
      crStore.updateCrStatus(crId, { status: 'patch_pending', updatedAt: new Date().toISOString() });
    }
  }

  function regressionComplete(runResult, crId, crStore, releaseNotePath) {
    const passed = runResult.status === 'completed';
    crStore.createRegressionResult({
      crId,
      runId: runResult.id,
      status: passed ? 'passed' : 'failed',
      totalTests: null,
      passedTests: null,
      failedTests: null,
      reportPath: releaseNotePath,
      createdAt: new Date().toISOString()
    });
    crStore.updateCrStatus(crId, {
      status: passed ? 'released' : 'patch_pending',
      regressionRunId: runResult.id,
      updatedAt: new Date().toISOString()
    });
  }

  // ---------------------------------------------------------------------------
  // POST /api/change-requests/:id/execute-patch
  // ---------------------------------------------------------------------------
  app.post('/api/change-requests/:id/execute-patch', async (req, res, next) => {
    try {
      const cr = store.getCr(req.params.id);
      if (!cr) {
        res.status(404).json({ error: 'change request not found' });
        return;
      }
      if (cr.status !== 'ia_done' && cr.status !== 'patch_pending') {
        res.status(400).json({ error: `cannot execute patch in status: ${cr.status}` });
        return;
      }
      const patchPlanDoc = store.getCrDocument(req.params.id, 'patch_plan');
      if (!patchPlanDoc) {
        res.status(400).json({ error: 'patch plan not found' });
        return;
      }
      if (!runner) {
        res.status(503).json({ error: 'runner unavailable' });
        return;
      }
      // Check for conflicting patch_running or regression_running in same project
      const allCrs = store.listCrs(cr.projectName);
      const conflict = allCrs.find(
        other => other.id !== cr.id && (other.status === 'patch_running' || other.status === 'regression_running')
      );
      if (conflict) {
        res.status(409).json({ error: 'another patch is running' });
        return;
      }
      store.updateCrStatus(req.params.id, { status: 'patch_running', updatedAt: new Date().toISOString() });
      const crId = req.params.id;
      setImmediate(async () => {
        try {
          await runner.start({
            commandType: 'patch',
            crId,
            patchPhase: 'execute',
            projectName: cr.projectName,
            patchPlanPath: patchPlanDoc.path,
            onComplete: (runResult) => executePatchComplete(runResult, crId, store, runner, config)
          });
        } catch {
          store.updateCrStatus(crId, { status: 'patch_pending', updatedAt: new Date().toISOString() });
        }
      });
      res.status(202).json({ crId, status: 'patch_running' });
    } catch (error) {
      next(error);
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/change-requests/:id/trigger-regression
  // ---------------------------------------------------------------------------
  app.post('/api/change-requests/:id/trigger-regression', async (req, res, next) => {
    try {
      const cr = store.getCr(req.params.id);
      if (!cr) {
        res.status(404).json({ error: 'change request not found' });
        return;
      }
      if (!runner) {
        res.status(503).json({ error: 'runner unavailable' });
        return;
      }
      const crId = req.params.id;
      store.updateCrStatus(crId, { status: 'regression_running', updatedAt: new Date().toISOString() });
      const releaseNotePath = `${config.claudeAssetsDir}/release-${crId}.md`;
      setImmediate(async () => {
        try {
          await runner.start({
            commandType: 'patch',
            crId,
            patchPhase: 'regression',
            projectName: cr.projectName,
            onComplete: (regressionResult) => regressionComplete(regressionResult, crId, store, releaseNotePath)
          });
        } catch {
          store.updateCrStatus(crId, { status: 'patch_pending', updatedAt: new Date().toISOString() });
        }
      });
      res.status(202).json({ crId, status: 'regression_running' });
    } catch (error) {
      next(error);
    }
  });

  // ─── memory events API ────────────────────────────────────────────────────────

  const ALLOWED_MANUAL_EVENT_TYPES = new Set(['user_message', 'decision']);
  const INTERNAL_EVENT_TYPES = new Set(['command_run', 'agent_run']);

  app.post('/api/memory/events', (req, res, next) => {
    try {
      const { eventType, scopeType, scopeId, payload, occurredAt } = req.body || {};

      if (!eventType) {
        res.status(400).json({ error: 'eventType is required' });
        return;
      }
      if (INTERNAL_EVENT_TYPES.has(eventType)) {
        res.status(400).json({ error: `eventType '${eventType}' cannot be written manually` });
        return;
      }
      if (!ALLOWED_MANUAL_EVENT_TYPES.has(eventType)) {
        res.status(400).json({ error: `eventType must be one of: ${[...ALLOWED_MANUAL_EVENT_TYPES].join(', ')}` });
        return;
      }
      if (!scopeType) {
        res.status(400).json({ error: 'scopeType is required' });
        return;
      }
      if (!scopeId) {
        res.status(400).json({ error: 'scopeId is required' });
        return;
      }
      if (payload === undefined || payload === null) {
        res.status(400).json({ error: 'payload is required' });
        return;
      }

      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const resolvedOccurredAt = occurredAt || now;

      store.createRawEvent({
        id,
        eventType,
        scopeType,
        scopeId,
        payload: payloadStr,
        source: 'user',
        occurredAt: resolvedOccurredAt
      });

      const event = store.getRawEvent(id);

      setImmediate(() => triggerCompress(scopeType, scopeId, store, runner, config));

      res.status(201).json(event);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/memory/events', (req, res, next) => {
    try {
      const { scopeType, scopeId, eventType } = req.query;
      const limit = req.query.limit !== undefined ? parseInt(req.query.limit, 10) : 50;
      const offset = req.query.offset !== undefined ? parseInt(req.query.offset, 10) : 0;

      const filter = {};
      if (scopeType) filter.scopeType = scopeType;
      if (scopeId) filter.scopeId = scopeId;
      if (eventType) filter.eventType = eventType;

      // 获取总数（不分页）
      const allEvents = store.listRawEvents({ ...filter, limit: 100000, offset: 0 });
      const total = allEvents.length;

      const events = store.listRawEvents({ ...filter, limit, offset });

      res.json({ events, total });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/memory/events/:id', (req, res, next) => {
    try {
      const event = store.getRawEvent(req.params.id);
      if (!event) {
        res.status(404).json({ error: 'event not found' });
        return;
      }
      res.json(event);
    } catch (error) {
      next(error);
    }
  });

  // ─── memory episodes API ──────────────────────────────────────────────────────

  app.get('/api/memory/episodes', (req, res, next) => {
    try {
      const { scopeType, scopeId } = req.query;
      const limit = req.query.limit !== undefined ? parseInt(req.query.limit, 10) : 20;
      const offset = req.query.offset !== undefined ? parseInt(req.query.offset, 10) : 0;

      const filter = {};
      if (scopeType) filter.scopeType = scopeType;
      if (scopeId) filter.scopeId = scopeId;

      const allEpisodes = store.listEpisodes({ ...filter, limit: 100000, offset: 0 });
      const total = allEpisodes.length;
      const episodes = store.listEpisodes({ ...filter, limit, offset });

      res.json({ episodes, total });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/memory/episodes/:id', (req, res, next) => {
    try {
      const episode = store.getEpisode(req.params.id);
      if (!episode) {
        res.status(404).json({ error: 'episode not found' });
        return;
      }
      res.json(episode);
    } catch (error) {
      next(error);
    }
  });

  // ─── memory facts API ─────────────────────────────────────────────────────────

  app.get('/api/memory/facts', (req, res, next) => {
    try {
      const { scopeType, scopeId, status } = req.query;
      const limit = req.query.limit !== undefined ? parseInt(req.query.limit, 10) : 20;
      const offset = req.query.offset !== undefined ? parseInt(req.query.offset, 10) : 0;

      const filter = {};
      if (scopeType) filter.scopeType = scopeType;
      if (scopeId) filter.scopeId = scopeId;
      if (status) filter.status = status;

      const allFacts = store.listFacts({ ...filter, limit: 100000, offset: 0 });
      const total = allFacts.length;
      const facts = store.listFacts({ ...filter, limit, offset });

      res.json({ facts, total });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/memory/facts/:id', (req, res, next) => {
    try {
      const fact = store.getFact(req.params.id);
      if (!fact) {
        res.status(404).json({ error: 'fact not found' });
        return;
      }
      res.json(fact);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/memory/facts/:id/reject', (req, res, next) => {
    try {
      const existing = store.getFact(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'fact not found' });
        return;
      }
      const updated = store.updateFactStatus(req.params.id, 'rejected');
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  // ─── memory packs API ─────────────────────────────────────────────────────────
  // 注意：/latest 必须在 /:id 之前注册

  app.get('/api/memory/packs/latest', (req, res, next) => {
    try {
      const { scopeType, scopeId } = req.query;
      const pack = store.getLatestRetrievalPack(scopeType, scopeId);
      if (!pack) {
        res.status(404).json({ error: 'no active pack found' });
        return;
      }
      res.json(pack);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/memory/packs', (req, res, next) => {
    try {
      const { scopeType, scopeId } = req.query;
      const limit = req.query.limit !== undefined ? parseInt(req.query.limit, 10) : 10;
      const packs = store.listRetrievalPacks(scopeType, scopeId, limit);
      res.json({ packs });
    } catch (error) {
      next(error);
    }
  });

  // ─── Phase 4: 四层项目结构 API ────────────────────────────────────────────────

  app.get('/api/products', (_req, res, next) => {
    try {
      res.json({ products: store.listProducts() });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/products', (req, res, next) => {
    try {
      const { name, clientName, rootPath } = req.body || {};
      if (!name || typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const product = {
        id,
        name: name.trim(),
        clientName: clientName || null,
        rootPath: rootPath || null,
        status: 'idea',
        createdAt: now,
        updatedAt: now
      };
      store.createProduct(product);
      res.status(201).json(product);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/products/:id/tree', (req, res, next) => {
    try {
      const product = store.getProductTree(req.params.id);
      if (!product) {
        res.status(404).json({ error: 'product not found' });
        return;
      }
      res.json({ product });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/products/:id', (req, res, next) => {
    try {
      const product = store.getProduct(req.params.id);
      if (!product) {
        res.status(404).json({ error: 'product not found' });
        return;
      }
      const milestones = store.listMilestones(product.id);
      res.json({ product, milestones });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/products/:id', (req, res, next) => {
    try {
      if (!store.getProduct(req.params.id)) {
        res.status(404).json({ error: 'product not found' });
        return;
      }
      store.updateProduct(req.params.id, req.body || {});
      res.json({ product: store.getProduct(req.params.id) });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/products/:id', (req, res, next) => {
    try {
      if (!store.getProduct(req.params.id)) {
        res.status(404).json({ error: 'product not found' });
        return;
      }
      store.deleteProduct(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/products/:productId/milestones', (req, res, next) => {
    try {
      const milestones = store.listMilestones(req.params.productId);
      res.json({ milestones });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/products/:productId/milestones', (req, res, next) => {
    try {
      const { name, gateScope, targetDate } = req.body || {};
      if (!name || typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      const product = store.getProduct(req.params.productId);
      if (!product) {
        res.status(404).json({ error: 'product not found' });
        return;
      }
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const milestone = {
        id,
        productId: req.params.productId,
        name: name.trim(),
        status: 'planned',
        gateScope: gateScope || null,
        targetDate: targetDate || null,
        createdAt: now,
        updatedAt: now
      };
      store.createMilestone(milestone);
      res.status(201).json(milestone);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/milestones/:id', (req, res, next) => {
    try {
      const milestone = store.getMilestone(req.params.id);
      if (!milestone) {
        res.status(404).json({ error: 'milestone not found' });
        return;
      }
      const { status } = req.body || {};
      if (status === 'released' && store.listWorkstreams(req.params.id).some(workstream => workstream.status === 'blocked')) {
        res.status(400).json({ error: 'cannot release milestone with blocked workstreams' });
        return;
      }
      store.updateMilestone(req.params.id, req.body || {});
      res.json({ milestone: store.getMilestone(req.params.id) });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/milestones/:id', (req, res, next) => {
    try {
      if (!store.getMilestone(req.params.id)) {
        res.status(404).json({ error: 'milestone not found' });
        return;
      }
      store.deleteMilestone(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/milestones/:milestoneId/workstreams', (req, res, next) => {
    try {
      const workstreams = store.listWorkstreams(req.params.milestoneId);
      res.json({ workstreams });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/milestones/:milestoneId/workstreams', (req, res, next) => {
    try {
      const { name, ownerRole, projectName, status } = req.body || {};
      if (!name || typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      const milestone = store.getMilestone(req.params.milestoneId);
      if (!milestone) {
        res.status(404).json({ error: 'milestone not found' });
        return;
      }
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const workstream = {
        id,
        milestoneId: req.params.milestoneId,
        name: name.trim(),
        status: status || 'todo',
        ownerRole: ownerRole || null,
        projectName: projectName || null,
        createdAt: now,
        updatedAt: now
      };
      store.createWorkstream(workstream);
      res.status(201).json(workstream);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/workstreams/:id', (req, res, next) => {
    try {
      if (!store.getWorkstream(req.params.id)) {
        res.status(404).json({ error: 'workstream not found' });
        return;
      }
      store.updateWorkstream(req.params.id, req.body || {});
      res.json({ workstream: store.getWorkstream(req.params.id) });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/workstreams/:id', (req, res, next) => {
    try {
      if (!store.getWorkstream(req.params.id)) {
        res.status(404).json({ error: 'workstream not found' });
        return;
      }
      store.deleteWorkstream(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/workstreams/:workstreamId/tasks', (req, res, next) => {
    try {
      const tasks = store.listTasks(req.params.workstreamId);
      res.json({ tasks });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/workstreams/:workstreamId/tasks', (req, res, next) => {
    try {
      const { title, agentRole, priority, acceptanceRef, status } = req.body || {};
      if (!title || typeof title !== 'string' || title.trim() === '') {
        res.status(400).json({ error: 'title is required' });
        return;
      }
      const workstream = store.getWorkstream(req.params.workstreamId);
      if (!workstream) {
        res.status(404).json({ error: 'workstream not found' });
        return;
      }
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const task = {
        id,
        workstreamId: req.params.workstreamId,
        title: title.trim(),
        status: status || 'backlog',
        agentRole: agentRole || null,
        priority: priority || null,
        acceptanceRef: acceptanceRef || null,
        createdAt: now,
        updatedAt: now
      };
      store.createTask(task);
      res.status(201).json(task);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/tasks/:id', (req, res, next) => {
    try {
      if (!store.getTask(req.params.id)) {
        res.status(404).json({ error: 'task not found' });
        return;
      }
      store.updateTask(req.params.id, req.body || {});
      res.json({ task: store.getTask(req.params.id) });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/tasks/:id', (req, res, next) => {
    try {
      if (!store.getTask(req.params.id)) {
        res.status(404).json({ error: 'task not found' });
        return;
      }
      store.deleteTask(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/gates', (req, res, next) => {
    try {
      const { scopeType, scopeId, gateName, status, evidencePath } = req.body || {};
      if (!scopeType || !scopeId || !gateName || !status) {
        res.status(400).json({ error: 'scopeType, scopeId, gateName, and status are required' });
        return;
      }
      store.upsertGate({
        scopeType,
        scopeId,
        gateName,
        status,
        evidencePath: evidencePath || null,
        checkedAt: new Date().toISOString()
      });
      res.status(201).json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/gates', (req, res, next) => {
    try {
      const { scopeType, scopeId } = req.query;
      if (!scopeType || !scopeId) {
        res.status(400).json({ error: 'scopeType and scopeId are required' });
        return;
      }
      res.json({ gates: store.listGatesByScope(scopeType, scopeId) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/approvals', (req, res, next) => {
    try {
      res.json({ approvals: store.listPendingApprovals() });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/approvals/:id/approve', (req, res, next) => {
    try {
      const approval = store.getApproval(req.params.id);
      if (!approval) {
        res.status(404).json({ error: 'approval not found' });
        return;
      }
      if (approval.status !== 'pending') {
        res.status(400).json({ error: `approval is already ${approval.status}` });
        return;
      }
      const { note } = req.body || {};
      store.updateApprovalStatus(req.params.id, 'approved', note || null);
      res.json(store.getApproval(req.params.id));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/approvals/:id/reject', (req, res, next) => {
    try {
      const approval = store.getApproval(req.params.id);
      if (!approval) {
        res.status(404).json({ error: 'approval not found' });
        return;
      }
      if (approval.status !== 'pending') {
        res.status(400).json({ error: `approval is already ${approval.status}` });
        return;
      }
      const { note } = req.body || {};
      store.updateApprovalStatus(req.params.id, 'rejected', note || null);
      res.json(store.getApproval(req.params.id));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/stats/costs', (req, res, next) => {
    try {
      res.json(store.getCostSummary());
    } catch (error) {
      next(error);
    }
  });



  // ─── manual compress trigger ──────────────────────────────────────────────────

  app.post('/api/memory/compress', (req, res, next) => {
    try {
      const { scopeType, scopeId } = req.body || {};

      if (!scopeType) {
        res.status(400).json({ error: 'scopeType is required' });
        return;
      }
      if (!scopeId) {
        res.status(400).json({ error: 'scopeId is required' });
        return;
      }
      if (!runner) {
        res.status(503).json({ error: 'runner not available' });
        return;
      }

      setImmediate(() => triggerCompress(scopeType, scopeId, store, runner, config));
      res.status(202).json({ message: 'compress triggered' });
    } catch (error) {
      next(error);
    }
  });

  // ─── SSE 日志流（此路由因 Express 先匹配而不会被触发，保留作备份） ──────────────

  app.use((req, res) => {
    res.status(404).json({ error: `not found: ${req.method} ${req.path}` });
  });

  app.use((_err, _req, res, _next) => {
    res.status(500).json({ error: 'internal server error' });
  });

  return app;
}

module.exports = { createApp, collectDashboard };
