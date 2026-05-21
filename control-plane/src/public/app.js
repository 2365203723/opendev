/* v8 ignore start */
const state = {
  dashboard: null,
  isLoading: false
};

const elements = {
  totalProjects: document.getElementById('total-projects'),
  activeAgents: document.getElementById('active-agents'),
  blockedProjects: document.getElementById('blocked-projects'),
  lessonsCount: document.getElementById('lessons-count'),
  statusMessage: document.getElementById('status-message'),
  projectsList: document.getElementById('projects-list'),
  blockersList: document.getElementById('blockers-list'),
  runsList: document.getElementById('runs-list'),
  logsList: document.getElementById('logs-list'),
  rebuildIndex: document.getElementById('rebuild-index'),
  refreshDashboard: document.getElementById('refresh-dashboard'),
  runnerForm: document.getElementById('runner-form'),
  commandType: document.getElementById('command-type'),
  targetName: document.getElementById('target-name')
};

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data;
}

function setLoading(isLoading) {
  state.isLoading = isLoading;
  elements.rebuildIndex.disabled = isLoading;
  elements.refreshDashboard.disabled = isLoading;
}

function setStatus(message) {
  elements.statusMessage.textContent = message;
}

function emptyMessage(message) {
  const paragraph = document.createElement('p');
  paragraph.className = 'empty';
  paragraph.textContent = message;
  return paragraph;
}

function createBadge(text, status) {
  const badge = document.createElement('span');
  badge.className = status ? `badge ${status}` : 'badge';
  badge.textContent = text;
  return badge;
}

function renderSummary(summary = {}) {
  elements.totalProjects.textContent = summary.totalProjects ?? 0;
  elements.activeAgents.textContent = summary.activeAgents ?? 0;
  elements.blockedProjects.textContent = summary.blockedProjects ?? 0;
  elements.lessonsCount.textContent = summary.lessonsCount ?? 0;
}

function renderProjects(projects = []) {
  elements.projectsList.replaceChildren();

  if (projects.length === 0) {
    elements.projectsList.appendChild(emptyMessage('暂无项目。'));
    return;
  }

  const cards = projects.map(project => {
    const card = document.createElement('article');
    card.className = 'project-card';

    const content = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'project-title';
    title.textContent = project.name || '未命名项目';

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${project.phase || 'unknown'} · ${project.rootPath || 'no path'}`;
    content.append(title, meta);

    const badges = document.createElement('div');
    badges.className = 'badges';
    badges.append(
      createBadge(project.complexity || 'unknown'),
      createBadge(`reopen ${project.reopenCount ?? 0}`)
    );

    card.append(content, badges);
    return card;
  });

  elements.projectsList.append(...cards);
}

function renderBlockers(blockers = [], failingGates = []) {
  elements.blockersList.replaceChildren();

  if (blockers.length === 0 && failingGates.length === 0) {
    elements.blockersList.appendChild(emptyMessage('当前没有阻塞或失败 Gate。'));
    return;
  }

  const blockerItems = blockers.map(blocker => ({
    title: `${blocker.projectName || 'unknown'} · ${blocker.agent || 'agent'}`,
    meta: blocker.reason || 'blocked',
    badge: createBadge('blocked', 'fail')
  }));
  const gateItems = failingGates.map(gate => ({
    title: `${gate.projectName || 'unknown'} · ${gate.gate || 'gate'}`,
    meta: gate.evidencePath || 'no evidence path',
    badge: createBadge(gate.status || 'fail', gate.status || 'fail')
  }));

  elements.blockersList.append(...[...blockerItems, ...gateItems].map(renderItem));
}

function renderRuns(runs = []) {
  elements.runsList.replaceChildren();

  if (runs.length === 0) {
    elements.runsList.appendChild(emptyMessage('暂无 Runner 记录。'));
    return;
  }

  const items = runs.slice(0, 6).map(run => renderItem({
    title: `${run.commandType || 'run'} ${run.targetName || ''}`.trim(),
    meta: run.status || run.id || 'created',
    badge: createBadge(run.status || 'run')
  }));

  elements.runsList.append(...items);
}

function renderLogs(dashboard = {}) {
  elements.logsList.replaceChildren();

  const artifacts = dashboard.artifacts || dashboard.recentArtifacts || [];
  if (artifacts.length === 0) {
    elements.logsList.appendChild(emptyMessage('暂无日志摘要。'));
    return;
  }

  const rows = artifacts.slice(0, 8).map(artifact => {
    const row = document.createElement('div');
    row.className = 'log-row';

    const label = document.createElement('strong');
    label.textContent = artifact.type || artifact.projectName || 'log';

    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = artifact.summary || artifact.path || '无摘要';

    row.append(label, meta);
    return row;
  });

  elements.logsList.append(...rows);
}

function renderItem(item) {
  const wrapper = document.createElement('div');
  wrapper.className = 'item';

  const title = document.createElement('div');
  title.className = 'item-title';
  title.textContent = item.title;

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = item.meta;

  wrapper.append(title, meta);
  if (item.badge) {
    const badges = document.createElement('div');
    badges.className = 'badges';
    badges.appendChild(item.badge);
    wrapper.appendChild(badges);
  }

  return wrapper;
}

function renderDashboard(dashboard) {
  renderSummary(dashboard.summary);
  renderProjects(dashboard.projects);
  renderBlockers(dashboard.blockers, dashboard.failingGates);
  renderRuns(dashboard.runs);
  renderLogs(dashboard);
}

async function loadDashboard() {
  setLoading(true);
  setStatus('加载中');

  try {
    const dashboard = await fetchJson('/api/dashboard');
    state.dashboard = dashboard;
    renderDashboard(dashboard);
    setStatus('已同步');
  } catch (error) {
    setStatus(error.message);
  } finally {
    setLoading(false);
  }
}

async function rebuildIndex() {
  setLoading(true);
  setStatus('正在重建索引');

  try {
    const result = await fetchJson('/api/index/rebuild', { method: 'POST' });
    setStatus(`索引完成：${result.indexedProjects ?? 0} 个项目`);
    await loadDashboard();
  } catch (error) {
    setStatus(error.message);
    setLoading(false);
  }
}

async function startRunner(event) {
  event.preventDefault();
  const payload = {
    commandType: elements.commandType.value,
    targetName: elements.targetName.value.trim()
  };

  setLoading(true);
  setStatus('正在启动 Runner');

  try {
    await fetchJson('/api/runs', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    elements.runnerForm.reset();
    setStatus('Runner 已启动');
    await loadDashboard();
  } catch (error) {
    setStatus(error.message);
    setLoading(false);
  }
}

elements.refreshDashboard.addEventListener('click', loadDashboard);
elements.rebuildIndex.addEventListener('click', rebuildIndex);
elements.runnerForm.addEventListener('submit', startRunner);

loadDashboard();
