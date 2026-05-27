/* v8 ignore start */

// ── 状态 ──────────────────────────────────────────────────────────────────────

const state = {
  activeDrawerPanel: 'cli',
  activeMemoryTab: 'facts',
  logSource: null,
  approvalsTimer: null,
  selectedType: 'go',
  activeRunId: null,
  lastSessionId: null,
  projects: [],
  runs: [],
  searchQuery: '',
  approvalCount: 0,
  costSummary: null,
  activeMainView: 'home',
  activeWorkspacePanel: null,
  selectedProjectName: null,
  selectedProjectDetail: null,
  activeTranscriptFilter: 'all',
  currentRunEvents: [],
  currentRunToolCounts: {}
};

// ── 工具函数 ──────────────────────────────────────────────────────────────────

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function el(id) { return document.getElementById(id); }

function badge(text, cls) {
  const span = document.createElement('span');
  span.className = cls ? `badge ${cls}` : 'badge';
  span.textContent = text;
  return span;
}

function empty(msg) {
  const p = document.createElement('p');
  p.className = 'empty';
  p.textContent = msg;
  return p;
}

function btn(label, cls, onClick) {
  const b = document.createElement('button');
  b.className = cls || 'btn';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${Math.floor(diff / 86400000)} 天前`;
}

function setStatusDot(s) {
  const dot = el('status-dot');
  if (!dot) return;
  dot.className = `status-dot ${s}`;
  dot.title = s === 'ok' ? '已同步' : s === 'loading' ? '加载中' : '错误';
}

function showToast(message, type = 'error') {
  const container = el('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── 主页：项目卡片 ────────────────────────────────────────────────────────────

async function loadHomePage() {
  setStatusDot('loading');
  try {
    const [{ projects = [] }, { runs = [] }, costData] = await Promise.all([
      fetchJson('/api/projects').catch(() => ({ projects: [] })),
      fetchJson('/api/runs').catch(() => ({ runs: [] })),
      fetchJson('/api/stats/costs').catch(() => null)
    ]);
    state.projects = projects;
    state.runs = runs;
    state.costSummary = costData;
    renderCommandCenter(projects, runs);
    if (state.activeMainView === 'project' && state.selectedProjectName) {
      loadProjectDetail(state.selectedProjectName);
    }
    refreshPipelineViz(projects, runs);
    renderSidebar(projects, runs);
    updateStatusbar(projects, runs);
    setStatusDot('ok');
  } catch (e) {
    setStatusDot('error');
    updateStatusbar(state.projects, state.runs, true);
    showToast(e.message || '加载失败');
  }
}

function getSearchFilteredData() {
  const q = state.searchQuery.trim().toLowerCase();
  if (!q) return { projects: state.projects, runs: state.runs };
  const projects = state.projects.filter(p => [p.name, p.phase, p.status, p.complexity].some(v => String(v || '').toLowerCase().includes(q)));
  const projectNames = new Set(projects.map(p => p.name));
  const runs = state.runs.filter(r => projectNames.has(r.targetName) || [r.targetName, r.commandType, r.status].some(v => String(v || '').toLowerCase().includes(q)));
  const namesFromRuns = new Set(runs.map(r => r.targetName).filter(Boolean));
  const mergedProjects = [
    ...projects,
    ...state.projects.filter(p => namesFromRuns.has(p.name) && !projectNames.has(p.name))
  ];
  return { projects: mergedProjects, runs };
}

function renderFilteredHome() {
  const { projects, runs } = getSearchFilteredData();
  renderProjectCards(projects, runs);
  renderCommandCenter(projects, runs);
}

function commandItem(title, meta, status, onClick) {
  const item = document.createElement(onClick ? 'button' : 'div');
  item.className = 'command-item';
  if (onClick) {
    item.type = 'button';
    item.addEventListener('click', onClick);
  }
  const body = document.createElement('span');
  body.className = 'command-item-body';
  const titleEl = document.createElement('strong');
  titleEl.textContent = title;
  const metaEl = document.createElement('span');
  metaEl.textContent = meta;
  body.append(titleEl, metaEl);
  item.append(body, badge(status || 'ready', status));
  return item;
}

function renderCommandCenter(projects, runs) {
  renderCommandActiveRuns(runs);
  renderCommandActions(projects, runs);
  renderSystemHealth();
}

function healthRow(check) {
  const row = document.createElement('div');
  row.className = `health-row ${check.status}`;
  const dot = document.createElement('span');
  dot.className = `health-dot ${check.status}`;
  const text = document.createElement('span');
  text.textContent = check.label;
  const detail = document.createElement('small');
  detail.textContent = check.detail;
  row.append(dot, text, detail);
  return row;
}

function renderCommandActiveRuns(runs) {
  const container = el('command-active-runs');
  const count = el('command-running-count');
  if (!container) return;
  container.replaceChildren();
  const activeRuns = runs.filter(r => r.status === 'running' || r.status === 'paused_permission').slice(0, 4);
  if (count) count.textContent = String(activeRuns.length);
  if (!activeRuns.length) {
    container.appendChild(commandItem('没有运行中的任务', '控制台处于可接单状态', 'completed'));
    return;
  }
  activeRuns.forEach(run => {
    container.appendChild(commandItem(run.targetName || '未命名运行', `${run.commandType || 'run'} · ${timeAgo(run.startedAt || run.createdAt)}`, run.status, () => openRunDetail(run)));
  });
}

function renderCommandActions(projects, runs) {
  const container = el('command-actions');
  const count = el('command-action-count');
  if (!container) return;
  container.replaceChildren();
  const pausedRuns = runs.filter(r => r.status === 'paused_permission');
  const blockedProjects = projects.filter(p => p.status === 'blocked');
  const actions = [
    ...pausedRuns.map(run => ({ title: run.targetName || '权限暂停', meta: '等待批准并重试', status: 'warning', onClick: () => openRunDetail(run) })),
    ...blockedProjects.map(project => ({ title: project.name, meta: '项目阻塞，进入详情处理', status: 'failed', onClick: () => openProjectDetail(project.name) }))
  ].slice(0, 5);
  if (count) count.textContent = String(actions.length);
  if (!actions.length) {
    container.appendChild(commandItem('没有待处理事项', '审批、权限和阻塞均正常', 'completed'));
    return;
  }
  actions.forEach(action => container.appendChild(commandItem(action.title, action.meta, action.status, action.onClick)));
}

async function renderSystemHealth() {
  const container = el('command-health');
  const status = el('command-health-status');
  if (!container) return;
  container.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'health-row';
  loading.textContent = '正在检查本地交付环境…';
  container.appendChild(loading);
  try {
    const data = await fetchJson('/api/system/health');
    container.replaceChildren();
    if (status) {
      status.textContent = data.status === 'pass' ? 'Ready' : data.status === 'warning' ? 'Review' : 'Blocked';
      status.className = `command-count ${data.status}`;
    }
    (data.checks || []).slice(0, 4).forEach(check => {
      container.appendChild(healthRow(check));
    });
  } catch (error) {
    container.replaceChildren(commandItem('健康检查不可用', error.message || '无法读取系统状态', 'failed'));
    if (status) {
      status.textContent = 'Blocked';
      status.className = 'command-count fail';
    }
  }
}

function statusDotClass(status) {
  if (status === 'running') return 'running';
  if (status === 'completed' || status === 'done') return 'done';
  if (status === 'failed' || status === 'blocked' || status === 'paused_permission') return 'blocked';
  return '';
}

function renderSidebar(projects, runs) {
  renderSidebarProjects(projects, runs);
  renderSidebarRuns(runs);
  renderSidebarAgents(projects, runs);
}

function renderSidebarProjects(projects, runs) {
  const container = el('sidebar-projects');
  if (!container) return;
  container.replaceChildren();
  const names = new Set();
  const rows = [];
  projects.forEach(p => {
    names.add(p.name);
    const latestRun = runs.find(r => r.targetName === p.name);
    rows.push({ name: p.name, status: p.status || latestRun?.status || '', meta: PHASE_LABELS[p.phase] || p.phase || '—' });
  });
  runs.forEach(r => {
    if (!r.targetName || names.has(r.targetName)) return;
    names.add(r.targetName);
    rows.push({ name: r.targetName, status: r.status, meta: r.commandType || 'run' });
  });
  if (!rows.length) { container.appendChild(sidebarEmpty('暂无项目')); return; }
  rows.slice(0, 12).forEach(row => {
    const item = sidebarItem(row.name, row.meta, row.status);
    item.addEventListener('click', () => {
      openProjectDetail(row.name);
    });
    container.appendChild(item);
  });
}

function renderSidebarRuns(runs) {
  const container = el('sidebar-runs');
  if (!container) return;
  container.replaceChildren();
  const activeRuns = runs.filter(r => r.status === 'running' || r.status === 'paused_permission').slice(0, 6);
  if (!activeRuns.length) { container.appendChild(sidebarEmpty('暂无运行中任务')); return; }
  activeRuns.forEach(run => {
    const item = sidebarItem(run.targetName || '未命名运行', run.commandType || run.status, run.status);
    if (run.logPath) item.addEventListener('click', () => openRunDetail(run));
    container.appendChild(item);
  });
}

function renderSidebarAgents(projects, runs) {
  const container = el('sidebar-agents');
  if (!container) return;
  container.replaceChildren();
  PIPELINE_AGENTS.forEach(agent => {
    const isActive = getActiveAgent(projects, runs) === agent;
    const idx = PIPELINE_AGENTS.indexOf(agent);
    const label = document.querySelector(`.agent-node[data-agent="${agent}"] .agent-label`)?.textContent || agent;
    const item = sidebarItem(label, `#${idx + 1}`, isActive ? 'running' : '');
    item.addEventListener('click', () => toggleAgentProjects(agent));
    container.appendChild(item);
  });
}

function sidebarItem(name, meta, status) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'sidebar-item';
  const dot = document.createElement('span');
  dot.className = `sidebar-dot ${statusDotClass(status)}`;
  const nameEl = document.createElement('span');
  nameEl.className = 'sidebar-item-name';
  nameEl.textContent = name;
  nameEl.title = name;
  const metaEl = document.createElement('span');
  metaEl.className = 'sidebar-item-meta';
  metaEl.textContent = meta || '';
  item.append(dot, nameEl, metaEl);
  return item;
}

function sidebarEmpty(text) {
  const emptyEl = document.createElement('div');
  emptyEl.className = 'sidebar-empty';
  emptyEl.textContent = text;
  return emptyEl;
}

function getActiveAgent(projects, runs) {
  const runningRun = runs.find(r => r.status === 'running');
  if (runningRun) {
    const project = projects.find(p => p.name === runningRun.targetName);
    return PHASE_TO_AGENT[project?.phase || runningRun.commandType] || 'architect';
  }
  const activeProject = projects.find(p => p.status === 'active' || p.status === 'in_progress');
  return activeProject ? (PHASE_TO_AGENT[activeProject.phase] || 'intake-analyst') : null;
}

function updateStatusbar(projects = [], runs = [], hasError = false) {
  const conn = el('status-conn-text');
  if (conn) conn.textContent = hasError ? '连接异常' : '已连接';
  const projectCount = el('status-project-count');
  if (projectCount) projectCount.textContent = String(projects.length);
  const runningCount = el('status-running-count');
  if (runningCount) runningCount.textContent = String(runs.filter(r => r.status === 'running' || r.status === 'paused_permission').length);
  const approvalCount = el('status-approval-count');
  if (approvalCount) approvalCount.textContent = String(state.approvalCount || 0);
  const cost = el('status-cost');
  if (cost) cost.textContent = state.costSummary ? `${Number(state.costSummary.totalCostCents || 0).toFixed(2)}¢` : '—';
}

function renderProjectCards(projects, runs) {
  const container = el('project-cards');
  container.replaceChildren();

  if (!projects.length && !runs.length) {
    const tip = document.createElement('p');
    tip.className = 'empty';
    tip.style.cssText = 'grid-column:1/-1;padding:40px 0;';
    tip.textContent = '还没有项目，在上方输入需求开始第一个项目。';
    container.appendChild(tip);
    return;
  }

  // 按项目名聚合 run（用于去重显示卡片 + 统计迭代次数）
  const runByProject = {};
  const iterationCounts = {};
  runs.forEach(r => {
    const key = r.targetName || '—';
    if (!runByProject[key] || new Date(r.startedAt) > new Date(runByProject[key].startedAt)) {
      runByProject[key] = r;
    }
    iterationCounts[key] = (iterationCounts[key] || 0) + 1;
  });

  // 合并：以 projects 为主，补充只有 runs 没有 project 记录的
  const projectNames = new Set(projects.map(p => p.name));
  const extraNames = Object.keys(runByProject).filter(n => !projectNames.has(n));

  const cards = [
    ...projects.map(p => ({
      name: p.name,
      phase: p.phase || 'intake',
      status: p.status || 'active',
      run: runByProject[p.name] || null,
      iterations: iterationCounts[p.name] || 0
    })),
    ...extraNames.map(n => ({
      name: n,
      phase: runByProject[n]?.commandType || '—',
      status: runByProject[n]?.status || 'unknown',
      run: runByProject[n],
      iterations: iterationCounts[n] || 1
    }))
  ];

  cards.forEach(card => container.appendChild(renderProjectCard(card)));
}

function showMainView(viewName) {
  state.activeMainView = viewName;
  const home = document.querySelector('.home');
  const detail = el('project-detail-view');
  const workspace = el('workspace-panel-view');
  if (home) home.hidden = viewName !== 'home';
  if (detail) detail.hidden = viewName !== 'project';
  if (workspace) workspace.hidden = viewName !== 'workspace';
  document.querySelectorAll('[data-shell-panel]').forEach(item => {
    const isHome = viewName === 'home' && item.dataset.shellPanel === 'dashboard';
    const isWorkspace = viewName === 'workspace' && item.dataset.shellPanel === state.activeWorkspacePanel;
    item.classList.toggle('active', isHome || isWorkspace);
  });
}

const WORKSPACE_PANEL_META = {
  monitor: { title: '运行监控', subtitle: '查看运行记录、待审批事项和实时日志。' },
  pipeline: { title: '交付链路', subtitle: '按项目追踪从需求到部署的交付阶段。' },
  memory: { title: '记忆', subtitle: '管理项目记忆、决策、风险和下次运行会注入的上下文。' },
  health: { title: '生产健康', subtitle: '检查本地交付环境是否具备真实工作流可用性。' }
};

function openWorkspacePanel(panel) {
  const target = el(`panel-${panel}`);
  if (!target) return;
  state.activeWorkspacePanel = panel;
  document.querySelectorAll('#workspace-panel-content > .shell-panel-content').forEach(item => {
    const isActive = item.id === `panel-${panel}`;
    item.hidden = !isActive;
    if (isActive) item.removeAttribute('hidden');
    else item.setAttribute('hidden', '');
  });
  el('workspace-panel-title').textContent = WORKSPACE_PANEL_META[panel]?.title || '工作区';
  el('workspace-panel-subtitle').textContent = WORKSPACE_PANEL_META[panel]?.subtitle || '';
  showMainView('workspace');
  if (panel === 'monitor') {
    loadRuns();
    if (state.approvalsTimer) clearInterval(state.approvalsTimer);
    state.approvalsTimer = setInterval(loadApprovals, 3000);
  } else if (state.approvalsTimer) {
    clearInterval(state.approvalsTimer);
    state.approvalsTimer = null;
  }
  if (panel === 'pipeline') loadPipeline();
  if (panel === 'memory') loadMemory();
  if (panel === 'health') loadHealthPanel();
}

async function loadHealthPanel() {
  const container = el('health-check-list');
  if (!container) return;
  container.replaceChildren(empty('正在检查本地交付环境…'));
  try {
    const data = await fetchJson('/api/system/health');
    container.replaceChildren();
    (data.checks || []).forEach(check => container.appendChild(healthRow(check)));
    if (!(data.checks || []).length) container.appendChild(empty('暂无检查项'));
  } catch (error) {
    container.replaceChildren(empty(error.message || '健康检查失败'));
  }
}

el('refresh-health')?.addEventListener('click', loadHealthPanel);

function closeWorkspacePanel() {
  if (state.approvalsTimer) {
    clearInterval(state.approvalsTimer);
    state.approvalsTimer = null;
  }
  state.activeWorkspacePanel = null;
  showMainView('home');
}

async function openProjectDetail(projectName) {
  if (!projectName) return;
  state.selectedProjectName = projectName;
  showMainView('project');
  await loadProjectDetail(projectName);
}

async function loadProjectDetail(projectName) {
  const title = el('project-detail-title');
  const summary = el('project-detail-summary');
  if (title) title.textContent = projectName;
  if (summary) summary.textContent = '加载项目工作区…';
  try {
    const runsData = await fetchJson('/api/runs').catch(() => ({ runs: state.runs }));
    const existingProject = state.projects.find(p => p.name === projectName);
    const detail = existingProject
      ? await fetchJson(`/api/projects/${encodeURIComponent(projectName)}`)
      : {
          project: { name: projectName, phase: 'run', status: 'run-only', complexity: 'unknown' },
          agents: [],
          gates: [],
          artifacts: []
        };
    const data = { ...detail, runs: runsData.runs || [] };
    state.selectedProjectDetail = data;
    renderProjectDetail(data);
  } catch (e) {
    state.selectedProjectDetail = null;
    if (summary) summary.textContent = e.message || '项目详情加载失败';
    ['project-detail-agents', 'project-detail-runs', 'project-detail-gates', 'project-detail-artifacts'].forEach(id => {
      const node = el(id);
      if (node) node.replaceChildren(empty('加载失败'));
    });
    showToast(e.message || '项目详情加载失败');
  }
}

function renderProjectDetail(data) {
  const project = data.project || {};
  const title = el('project-detail-title');
  const summary = el('project-detail-summary');
  if (title) title.textContent = project.name || state.selectedProjectName || '项目详情';
  if (summary) {
    const phase = PHASE_LABELS[project.phase] || project.phase || '未知阶段';
    const status = project.status || 'unknown';
    const complexity = project.complexity || 'unknown';
    summary.textContent = `${phase} · ${status} · ${complexity}`;
  }
  renderProjectDetailAgents(data.agents || []);
  renderProjectDetailRuns(project.name || state.selectedProjectName, data.runs || []);
  renderProjectDetailGates(data.gates || []);
  renderProjectContext(project.name || state.selectedProjectName);
  renderProjectDetailArtifacts(data.artifacts || []);
}

function renderProjectDetailAgents(agents) {
  const container = el('project-detail-agents');
  if (!container) return;
  container.replaceChildren();
  if (!agents.length) { container.appendChild(empty('暂无 Agent 状态')); return; }
  agents.forEach(agent => {
    const row = document.createElement('div');
    row.className = 'project-detail-row';
    const info = document.createElement('div');
    info.className = 'project-detail-row-info';
    const title = document.createElement('div');
    title.className = 'project-detail-row-title';
    title.textContent = agent.name || 'unknown';
    const meta = document.createElement('div');
    meta.className = 'project-detail-row-meta';
    meta.textContent = agent.blockReason || agent.lastRun || '—';
    info.append(title, meta);
    row.append(info, badge(agent.status || 'unknown', agent.status));
    container.appendChild(row);
  });
}

function renderProjectDetailRuns(projectName, runs) {
  const container = el('project-detail-runs');
  if (!container) return;
  container.replaceChildren();
  const projectRuns = runs.filter(r => r.targetName === projectName).slice(0, 8);
  if (!projectRuns.length) { container.appendChild(empty('暂无运行记录')); return; }
  projectRuns.forEach(run => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'project-detail-row project-detail-row-button';
    row.addEventListener('click', () => openRunDetail(run));
    const info = document.createElement('div');
    info.className = 'project-detail-row-info';
    const title = document.createElement('div');
    title.className = 'project-detail-row-title';
    title.textContent = `${run.commandType || 'run'} · ${run.id ? run.id.slice(0, 8) : '—'}`;
    const meta = document.createElement('div');
    meta.className = 'project-detail-row-meta';
    meta.textContent = timeAgo(run.startedAt || run.createdAt);
    info.append(title, meta);
    row.append(info, badge(run.status || 'unknown', run.status));
    container.appendChild(row);
  });
}

function renderProjectDetailGates(gates) {
  renderGateSummary(gates);
  renderGateList(gates);
}

function normalizeGate(gate) {
  return {
    name: gate.gateName || gate.name || 'Gate',
    status: gate.status || 'unknown',
    evidencePath: gate.evidencePath || '',
    checkedAt: gate.checkedAt || '',
    scopeType: gate.scopeType || 'project',
    scopeId: gate.scopeId || state.selectedProjectName || ''
  };
}

function getGateStatusClass(status) {
  if (status === 'pass' || status === 'passed' || status === 'completed') return 'completed';
  if (status === 'fail' || status === 'failed' || status === 'blocked') return 'failed';
  if (status === 'warning') return 'warning';
  return '';
}

function renderGateSummary(gates) {
  const container = el('quality-gate-summary');
  if (!container) return;
  container.replaceChildren();
  const normalized = gates.map(normalizeGate);
  const passed = normalized.filter(g => getGateStatusClass(g.status) === 'completed').length;
  const failed = normalized.filter(g => getGateStatusClass(g.status) === 'failed').length;
  const warning = normalized.filter(g => getGateStatusClass(g.status) === 'warning').length;
  [['通过', passed], ['失败', failed], ['警告', warning], ['总数', normalized.length]].forEach(([label, value]) => {
    const card = document.createElement('div');
    card.className = 'quality-summary-card';
    const valueEl = document.createElement('strong');
    valueEl.textContent = String(value);
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    card.append(valueEl, labelEl);
    container.appendChild(card);
  });
}

function renderGateList(gates) {
  const container = el('quality-gate-list');
  const actions = el('quality-regression-actions');
  const legacy = el('project-detail-gates');
  if (legacy) legacy.replaceChildren();
  if (!container) return;
  container.replaceChildren();
  if (actions) actions.replaceChildren();
  const normalized = gates.map(normalizeGate);
  if (!normalized.length) { container.appendChild(empty('暂无 Gate 数据')); return; }
  normalized.forEach(gate => {
    const row = document.createElement('div');
    row.className = `quality-gate-card ${getGateStatusClass(gate.status)}`;
    const info = document.createElement('div');
    info.className = 'project-detail-row-info';
    const title = document.createElement('div');
    title.className = 'project-detail-row-title';
    title.textContent = gate.name;
    const meta = document.createElement('div');
    meta.className = 'project-detail-row-meta';
    meta.textContent = gate.evidencePath || gate.checkedAt || '无证据路径';
    info.append(title, meta);
    row.append(info, badge(gate.status, getGateStatusClass(gate.status)));
    if (getGateStatusClass(gate.status) === 'failed') {
      row.appendChild(btn('创建修复请求', 'btn btn-sm', () => openGateFixDialog(gate)));
    }
    container.appendChild(row);
  });
  if (actions) {
    const failedCount = normalized.filter(g => getGateStatusClass(g.status) === 'failed').length;
    actions.textContent = failedCount ? `${failedCount} 个质量门失败，建议创建修复请求并触发回归。` : '当前没有失败质量门。';
  }
}

function renderGateEvidence(gate) {
  return gate.evidencePath || gate.checkedAt || '无证据路径';
}

function openGateFixDialog(gate) {
  const projectName = state.selectedProjectName || gate.scopeId;
  el('gate-fix-project').value = projectName;
  el('gate-fix-gate').value = gate.name;
  el('gate-fix-preview').textContent = `${projectName} · ${gate.name} · ${gate.status}`;
  el('gate-fix-title').value = `${gate.name} 未通过`;
  el('gate-fix-current').value = renderGateEvidence(gate);
  el('gate-fix-expected').value = `${gate.name} 达到通过状态`;
  el('gate-fix-criteria').value = `${gate.name} 状态为 pass\n相关测试或审查证据已生成`;
  const dialog = el('gate-fix-dialog');
  if (dialog.showModal) dialog.showModal();
  else dialog.removeAttribute('hidden');
}

function renderProjectContext(projectName) {
  const scope = el('context-scope-selector');
  if (scope) scope.textContent = `当前范围：project/${projectName || '—'}`;
  loadContextPack('project', projectName, 'context-pack-preview');
  loadContextFacts('project', projectName, 'context-facts-preview');
  const actions = el('context-compress-actions');
  if (!actions) return;
  actions.replaceChildren();
  actions.appendChild(btn('触发项目压缩', 'btn btn-sm', () => triggerMemoryCompress('project', projectName)));
}

async function loadContextPack(scopeType, scopeId, targetId) {
  const container = el(targetId);
  if (!container) return;
  container.textContent = '加载 Retrieval Pack…';
  try {
    const packsData = await fetchJson(`/api/memory/packs?scopeType=${encodeURIComponent(scopeType)}&scopeId=${encodeURIComponent(scopeId || '')}&limit=1`);
    const pack = (packsData.packs || [])[0];
    if (!pack) throw new Error('no active pack found');
    const content = typeof pack.content === 'string' ? pack.content : JSON.stringify(pack.content, null, 2);
    container.textContent = `Pack · ${scopeType}/${scopeId}\n${content.slice(0, 360)}${content.length > 360 ? '…' : ''}`;
  } catch {
    if (scopeType !== 'company') {
      container.textContent = `暂无 ${scopeType}/${scopeId} Pack，将使用公司级默认上下文。`;
      return;
    }
    container.textContent = '暂无 Retrieval Pack。';
  }
}

async function loadContextFacts(scopeType, scopeId, targetId) {
  const container = el(targetId);
  if (!container) return;
  container.textContent = '加载 Facts…';
  try {
    const data = await fetchJson(`/api/memory/facts?scopeType=${encodeURIComponent(scopeType)}&scopeId=${encodeURIComponent(scopeId || '')}&status=active&limit=5`);
    const facts = data.facts || [];
    if (!facts.length) { container.textContent = '暂无项目级 Active Facts。'; return; }
    container.textContent = `Active Facts · ${facts.length}\n${facts.map(f => `- ${f.content}`).join('\n').slice(0, 360)}`;
  } catch (e) {
    container.textContent = e.message || 'Facts 加载失败';
  }
}

async function triggerMemoryCompress(scopeType, scopeId) {
  try {
    await fetchJson('/api/memory/compress', {
      method: 'POST',
      body: JSON.stringify({ scopeType, scopeId })
    });
    showToast(`已触发压缩 · ${scopeType}/${scopeId}`, 'success');
  } catch (e) {
    showToast(e.message || '触发压缩失败');
  }
}

function renderProjectDetailArtifacts(artifacts) {
  const container = el('project-detail-artifacts');
  if (!container) return;
  container.replaceChildren();
  if (!artifacts.length) { container.appendChild(empty('暂无产物索引')); return; }
  artifacts.slice(0, 10).forEach(artifact => {
    const row = document.createElement('div');
    row.className = 'project-detail-row';
    const info = document.createElement('div');
    info.className = 'project-detail-row-info';
    const title = document.createElement('div');
    title.className = 'project-detail-row-title';
    title.textContent = artifact.type || 'artifact';
    const meta = document.createElement('div');
    meta.className = 'project-detail-row-meta';
    meta.textContent = artifact.path || artifact.summary || '—';
    info.append(title, meta);
    row.append(info);
    container.appendChild(row);
  });
}

function renderProjectCard({ name, phase, status, run, iterations }) {
  const isRunning = run?.status === 'running';
  const isDone = run?.status === 'completed' || status === 'done';
  const isBlocked = status === 'blocked' || run?.status === 'failed';

  const div = document.createElement('div');
  div.className = `project-card${isRunning ? ' is-running' : ''}`;

  const header = document.createElement('div');
  header.className = 'project-card-header';

  const dot = document.createElement('div');
  dot.className = `project-card-dot${isRunning ? ' running' : isDone ? ' done' : isBlocked ? ' blocked' : ''}`;

  const nameEl = document.createElement('div');
  nameEl.className = 'project-card-name';
  nameEl.textContent = name;
  nameEl.title = name;
  header.append(dot, nameEl);

  const meta = document.createElement('div');
  meta.className = 'project-card-meta';
  const phaseLabel = PHASE_LABELS[phase] || phase;
  meta.textContent = `${phaseLabel}${iterations > 0 ? ` · ${iterations} 次迭代` : ''}`;

  const footer = document.createElement('div');
  footer.className = 'project-card-footer';

  const time = document.createElement('span');
  time.className = 'project-card-time';
  time.textContent = run ? timeAgo(run.startedAt || run.createdAt) : '';

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:6px;align-items:center;';

  const iterateBtn = document.createElement('button');
  iterateBtn.className = 'project-card-iterate-btn';
  iterateBtn.textContent = '继续迭代';
  iterateBtn.title = `在 ${name} 上追加一轮开发`;
  iterateBtn.addEventListener('click', e => {
    e.stopPropagation();
    openIterateDialog(name);
  });
  actions.appendChild(iterateBtn);

  if (run?.logPath) {
    actions.appendChild(btn('日志', 'btn btn-sm', e => {
      e.stopPropagation();
      openRunDetail(run);
    }));
  }

  footer.append(time, actions);
  div.append(header, meta, footer);

  div.addEventListener('click', e => {
    if (e.target.closest('button')) return;
    openProjectDetail(name);
  });

  return div;
}

const PHASE_LABELS = {
  intake: '需求分析',
  design: '技术设计',
  build: '开发构建',
  qa: '质量测试',
  review: '代码审查',
  security: '安全审计',
  devops: '部署上线',
  done: '已完成',
  go: '开发中',
  recover: '修复中',
  patch: '补丁中',
  memory: '记忆压缩'
};

// ── Agent 流水线可视化 ─────────────────────────────────────────────────────────

const PIPELINE_AGENTS = [
  'intake-analyst', 'ceo', 'product-strategist', 'architect', 'ux-designer', 'pm-planner',
  'backend', 'frontend', 'qa-engineer', 'security-engineer', 'reviewer', 'devops'
];

const PHASE_TO_AGENT = {
  intake: 'intake-analyst', design: 'architect', build: 'backend',
  qa: 'qa-engineer', review: 'reviewer', security: 'security-engineer',
  devops: 'devops', done: 'devops'
};

function refreshPipelineViz(projects, runs) {
  // 找当前活跃的项目
  const runningRun = runs.find(r => r.status === 'running');
  const statusText = el('pipeline-status-text');
  const allNodes = document.querySelectorAll('.agent-node');

  // 重置所有节点
  allNodes.forEach(n => n.classList.remove('active', 'done'));

  if (!runningRun && !projects.some(p => p.phase && p.phase !== 'done')) {
    if (statusText) { statusText.textContent = '待命中'; statusText.className = 'pipeline-status-text'; }
    return;
  }

  // 确定当前活跃的 agent
  let activeAgent = null;
  if (runningRun) {
    const project = projects.find(p => p.name === runningRun.targetName);
    const phase = project?.phase || runningRun.commandType;
    activeAgent = PHASE_TO_AGENT[phase] || 'architect';
  } else {
    const activeProject = projects.find(p => p.status === 'active' || p.status === 'in_progress');
    if (activeProject) {
      activeAgent = PHASE_TO_AGENT[activeProject.phase] || 'intake-analyst';
    }
  }

  if (activeAgent) {
    const activeIdx = PIPELINE_AGENTS.indexOf(activeAgent);
    allNodes.forEach(node => {
      const agentName = node.dataset.agent;
      const idx = PIPELINE_AGENTS.indexOf(agentName);
      if (idx === activeIdx) node.classList.add('active');
      else if (idx >= 0 && idx < activeIdx) node.classList.add('done');
    });

    if (statusText) {
      const projectName = runningRun?.targetName || projects.find(p => p.status === 'active')?.name || '';
      const label = document.querySelector(`.agent-node.active .agent-label`)?.textContent || activeAgent;
      statusText.textContent = projectName ? `${projectName} · ${label}中` : `${label}中`;
      statusText.className = 'pipeline-status-text active';
    }
  }
}

// ── Agent 节点点击：展开负责项目 ─────────────────────────────────────────────────

let selectedAgentNode = null;

function toggleAgentProjects(agentName) {
  const row = el('agent-projects-row');
  const inner = el('agent-projects-inner');

  // 如果点击同一个 agent，收起
  if (selectedAgentNode === agentName) {
    selectedAgentNode = null;
    row.hidden = true;
    document.querySelectorAll('.agent-node').forEach(n => n.style.outline = '');
    return;
  }

  selectedAgentNode = agentName;
  row.hidden = false;
  inner.replaceChildren();

  // 高亮选中节点
  document.querySelectorAll('.agent-node').forEach(n => {
    n.style.outline = n.dataset.agent === agentName ? `2px solid var(--primary)` : '';
  });

  // 映射 agentName 到 project phase
  const AGENT_TO_PHASE = {
    'intake-analyst': 'intake',
    'ceo': 'intake',
    'product-strategist': 'design',
    'architect': 'design',
    'ux-designer': 'design',
    'pm-planner': 'build',
    'backend': 'build',
    'frontend': 'build',
    'qa-engineer': 'qa',
    'security-engineer': 'security',
    'reviewer': 'review',
    'devops': 'devops'
  };

  const targetPhase = AGENT_TO_PHASE[agentName];
  if (!targetPhase) { inner.appendChild(empty('未知 Agent')); return; }

  // 收集匹配的项目
  fetchJson('/api/projects').then(({ projects = [] }) => {
    const matched = projects.filter(p => (p.phase || 'intake') === targetPhase);
    if (!matched.length) {
      const tip = document.createElement('p');
      tip.className = 'empty';
      tip.style.padding = '8px 0';
      tip.textContent = '暂无项目在此阶段';
      inner.appendChild(tip);
      return;
    }
    matched.forEach(p => {
      const chip = document.createElement('div');
      chip.className = 'agent-project-chip';
      chip.addEventListener('click', () => openIterateDialog(p.name));

      const dot = document.createElement('div');
      dot.className = `agent-project-chip-dot ${p.status === 'blocked' ? 'blocked' : p.status === 'done' ? 'done' : ''}`;
      if (p.status === 'active' || p.status === 'in_progress') dot.classList.add('running');

      const name = document.createElement('span');
      name.textContent = p.name;
      name.style.cssText = 'font-weight:500;';

      const phase = document.createElement('span');
      phase.style.cssText = 'font-size:11px;color:var(--text-muted);';
      phase.textContent = PHASE_LABELS[p.phase] || p.phase || '';

      chip.append(dot, name, phase);
      inner.appendChild(chip);
    });
  }).catch(() => {
    inner.appendChild(empty('加载失败'));
  });
}

// 点击流水线外部关闭
document.addEventListener('click', e => {
  if (!selectedAgentNode) return;
  const viz = el('pipeline-viz');
  if (viz && !viz.contains(e.target)) {
    selectedAgentNode = null;
    el('agent-projects-row').hidden = true;
    document.querySelectorAll('.agent-node').forEach(n => n.style.outline = '');
  }
});

// 绑定 agent 节点点击
document.querySelector('.pipeline-track').addEventListener('click', e => {
  const node = e.target.closest('.agent-node');
  if (!node) return;
  toggleAgentProjects(node.dataset.agent);
});

// ── 迭代对话框 ─────────────────────────────────────────────────────────────────

function openIterateDialog(projectName) {
  const dialog = el('iterate-dialog');
  el('iterate-project').value = projectName;
  el('iterate-prompt').value = '';
  el('iterate-criteria').value = '';
  loadContextPack('project', projectName, 'iterate-context-preview');
  el('iterate-submit-btn').disabled = false;
  el('iterate-submit-btn').textContent = '启动迭代';
  if (dialog.showModal) dialog.showModal();
  else dialog.removeAttribute('hidden');
}

el('iterate-cancel').addEventListener('click', () => {
  el('iterate-dialog').close?.();
});

el('iterate-context-refresh')?.addEventListener('click', () => {
  const projectName = el('iterate-project').value;
  if (projectName) loadContextPack('project', projectName, 'iterate-context-preview');
});

el('gate-fix-cancel')?.addEventListener('click', () => {
  el('gate-fix-dialog').close?.();
});

el('gate-fix-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const projectName = el('gate-fix-project').value;
  const criteria = el('gate-fix-criteria').value.split('\n').map(s => s.trim()).filter(Boolean);
  if (!criteria.length) { el('gate-fix-criteria').focus(); return; }
  const submitBtn = el('gate-fix-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = '创建中…';
  try {
    await fetchJson('/api/change-requests', {
      method: 'POST',
      body: JSON.stringify({
        projectName,
        title: el('gate-fix-title').value.trim(),
        source: 'qa_finding',
        scope: 'project',
        currentBehavior: el('gate-fix-current').value.trim(),
        expectedBehavior: el('gate-fix-expected').value.trim(),
        acceptanceCriteria: criteria,
        priority: 'high'
      })
    });
    el('gate-fix-dialog').close?.();
    showToast('修复请求已创建', 'success');
  } catch (err) {
    showToast(err.message || '创建失败');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '创建';
  }
});

el('iterate-form').addEventListener('submit', async e => {
  e.preventDefault();
  const projectName = el('iterate-project').value.trim();
  const promptText = el('iterate-prompt').value.trim();
  if (!promptText) { el('iterate-prompt').focus(); return; }

  const criteria = el('iterate-criteria').value.split('\n').map(s => s.trim()).filter(Boolean);
  const submitBtn = el('iterate-submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = '启动中…';

  const fullPrompt = `在 ${projectName} 中执行 /go，这是已有项目的延续迭代。遵守项目 CLAUDE.md、governance 规则和 Codex 双审要求。请先读取项目现有文件和状态，在此基础上继续开发。\n\n## 本轮迭代目标\n${promptText}${criteria.length ? '\n\n## 验收标准\n' + criteria.map(l => `- ${l}`).join('\n') : ''}`;

  try {
    setStatusDot('loading');
    await fetchJson('/api/runs', {
      method: 'POST',
      body: JSON.stringify({ commandType: 'go', targetName: projectName, prompt: fullPrompt })
    });
    el('iterate-dialog').close?.();
    setStatusDot('ok');
    showToast(`迭代已启动 · ${projectName}`, 'success');
    await loadHomePage();
  } catch (err) {
    setStatusDot('error');
    showToast(err.message || '启动失败');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '启动迭代';
  }
});

function openSettingsDrawer(panel = 'cli') {
  el('settings-drawer').hidden = false;
  switchDrawerPanel(panel);
  if (panel === 'costs') loadDashboard();
  if (panel === 'skills') loadSkills();
  if (panel === 'mcps') loadMcps();
}

function closeSettingsDrawer() {
  el('settings-drawer').hidden = true;
  if (state.approvalsTimer) {
    clearInterval(state.approvalsTimer);
    state.approvalsTimer = null;
  }
  if (state.logSource) {
    state.logSource.close();
    state.logSource = null;
  }
}

function switchDrawerPanel(name) {
  state.activeDrawerPanel = name;
  document.querySelectorAll('.drawer-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.panel === name);
  });
  document.querySelectorAll('.drawer-content > .drawer-panel-content').forEach(panel => {
    const match = panel.id === `panel-${name}`;
    panel.hidden = !match;
    if (!match) panel.setAttribute('hidden', '');
    else panel.removeAttribute('hidden');
  });
}

el('settings-btn').addEventListener('click', () => openSettingsDrawer('cli'));
el('cli-badge')?.addEventListener('click', () => openSettingsDrawer('cli'));
el('settings-close').addEventListener('click', closeSettingsDrawer);
el('settings-overlay').addEventListener('click', closeSettingsDrawer);

document.querySelectorAll('.drawer-nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const panel = item.dataset.panel;
    switchDrawerPanel(panel);
    if (state.approvalsTimer) { clearInterval(state.approvalsTimer); state.approvalsTimer = null; }
    if (panel === 'costs') loadDashboard();
    if (panel === 'skills') loadSkills();
    if (panel === 'mcps') loadMcps();
  });
});

document.querySelectorAll('[data-open-panel]').forEach(item => {
  item.addEventListener('click', () => openSettingsDrawer(item.dataset.openPanel));
});

// ── 执行模式：CLI 扫描 ────────────────────────────────────────────────────────

const CLI_KNOWN = [
  { name: 'Claude Code', key: 'claude',   icon: 'CC', iconClass: 'claude', desc: 'Anthropic official CLI' },
  { name: 'Codex CLI',   key: 'codex',    icon: 'CX', iconClass: 'codex', desc: 'OpenAI official CLI' },
  { name: 'Gemini CLI',  key: 'gemini',   icon: 'GM', iconClass: 'gemini', desc: 'Google official CLI' },
  { name: 'OpenCode',    key: 'opencode', icon: 'OC', iconClass: 'opencode', desc: 'Open-source agent CLI' }
];

function getDefaultCLI() { return localStorage.getItem('defaultCLI') || ''; }
function setDefaultCLI(key) {
  localStorage.setItem('defaultCLI', key);
  updateTopbarBadge(key);
  document.querySelectorAll('.cli-default-btn').forEach(b => {
    b.textContent = b.dataset.key === key ? '默认' : '设为默认';
    b.classList.toggle('cli-is-default', b.dataset.key === key);
  });
}

function updateTopbarBadge(key) {
  const badge = el('cli-badge');
  if (!badge) return;
  const found = CLI_KNOWN.find(c => c.key === key);
  badge.textContent = found ? found.name : (key || '未选择 CLI');
  badge.title = '打开执行模式设置';
}

async function scanLocalCLI(forceRescan = false) {
  const list = el('cli-list');
  list.replaceChildren();

  const loadingItem = document.createElement('div');
  loadingItem.className = 'cli-item';
  const loadingMeta = document.createElement('span');
  loadingMeta.className = 'meta';
  loadingMeta.textContent = '检测中…';
  loadingItem.appendChild(loadingMeta);
  list.appendChild(loadingItem);

  const badge = el('cli-badge');
  if (badge) badge.textContent = '检测中…';

  try {
    const endpoint = forceRescan ? '/api/clis/rescan' : '/api/clis';
    const method = forceRescan ? 'POST' : 'GET';
    const { clis = [] } = await fetchJson(endpoint, forceRescan ? { method } : {});
    const detectedMap = Object.fromEntries(clis.map(c => [c.key, c]));
    const defaultKey = getDefaultCLI();

    list.replaceChildren();

    CLI_KNOWN.forEach(def => {
      const found = detectedMap[def.key];
      const isDetected = !!found;
      const isDefault = defaultKey === def.key;

      const item = document.createElement('div');
      item.className = `cli-item${isDetected ? ' cli-active' : ''}${isDefault ? ' cli-is-default' : ''}`;

      const info = document.createElement('div');
      info.className = 'cli-item-info';

      const icon = document.createElement('div');
      icon.className = `cli-icon cli-icon-${def.iconClass || def.key}`;
      icon.textContent = def.icon;

      const text = document.createElement('div');
      const nameLine = document.createElement('div');
      nameLine.className = 'cli-name';
      nameLine.textContent = def.name;
      const descLine = document.createElement('div');
      descLine.className = 'cli-version';
      descLine.textContent = isDetected ? `v${found.version} · ${found.path}` : `未检测到 ${def.key}`;
      text.append(nameLine, descLine);
      info.append(icon, text);

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0;';

      if (isDetected) {
        const testBtn = document.createElement('button');
        testBtn.className = 'btn btn-sm';
        testBtn.textContent = '测试';
        testBtn.addEventListener('click', () => testCLI(def.key, testBtn));
        actions.appendChild(testBtn);

        const defBtn = document.createElement('button');
        defBtn.className = `btn btn-sm cli-default-btn${isDefault ? ' btn-primary cli-is-default' : ''}`;
        defBtn.dataset.key = def.key;
        defBtn.textContent = isDefault ? '默认' : '设为默认';
        defBtn.addEventListener('click', () => setDefaultCLI(def.key));
        actions.appendChild(defBtn);
      } else {
        const statusEl = document.createElement('span');
        statusEl.style.cssText = 'font-size:12px;color:var(--text-subtle);';
        statusEl.textContent = '未安装';
        actions.appendChild(statusEl);
      }

      item.append(info, actions);
      list.appendChild(item);
    });

    // 如果没有默认，自动选第一个检测到的
    const firstDetected = clis[0];
    if (firstDetected) {
      if (!defaultKey || !detectedMap[defaultKey]) setDefaultCLI(firstDetected.key);
      else updateTopbarBadge(defaultKey);
    } else {
      if (badge) badge.textContent = '未检测到 CLI';
    }

  } catch (e) {
    list.replaceChildren();
    const item = document.createElement('div');
    item.className = 'cli-item';
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = `检测失败：${e.message}`;
    item.appendChild(meta);
    list.appendChild(item);
  }
}

async function testCLI(key, btnEl) {
  const orig = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = '测试中…';
  try {
    const { ok, output, error } = await fetchJson(`/api/clis/${key}/test`, { method: 'POST' });
    showToast(ok ? `✓ ${output}` : `✗ ${error}`, ok ? 'success' : 'error');
  } catch (e) {
    showToast(e.message || '测试失败');
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = orig;
  }
}

el('rescan-cli').addEventListener('click', () => scanLocalCLI(true));

// ── 权限绕过开关 ──────────────────────────────────────────────────────────────

async function loadBypassState() {
  try {
    const { dangerouslySkipPermissions } = await fetchJson('/api/permissions');
    const toggle = el('bypass-toggle');
    const warning = el('bypass-warning');
    if (toggle) toggle.checked = dangerouslySkipPermissions === true;
    if (warning) warning.hidden = !dangerouslySkipPermissions;
  } catch { /* 静默 */ }
}

el('bypass-toggle').addEventListener('change', async () => {
  const enabled = el('bypass-toggle').checked;
  const warning = el('bypass-warning');
  try {
    await fetchJson('/api/permissions', {
      method: 'POST',
      body: JSON.stringify({ dangerouslySkipPermissions: enabled })
    });
    if (warning) warning.hidden = !enabled;
    showToast(enabled ? '权限绕过已启用 — Claude CLI 可自动操作文件' : '权限绕过已关闭', enabled ? 'error' : 'success');
  } catch (e) {
    el('bypass-toggle').checked = !enabled;
    showToast(e.message || '设置失败');
  }
});

document.querySelectorAll('.exec-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.exec-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const mode = tab.dataset.mode;
    el('exec-local').hidden = mode !== 'local';
    el('exec-byok').hidden = mode !== 'byok';
    if (mode === 'byok') loadByokKeys();
  });
});

// ── BYOK 面板 ─────────────────────────────────────────────────────────────────

const BYOK_PROVIDERS = [
  { key: 'anthropic', name: 'Anthropic', hint: 'sk-ant-…', models: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'] },
  { key: 'openai',    name: 'OpenAI',    hint: 'sk-…',     models: ['gpt-4o', 'gpt-4o-mini'] },
  { key: 'deepseek',  name: 'DeepSeek',  hint: 'sk-…',     models: ['deepseek-chat', 'deepseek-coder'] },
];

async function loadByokKeys() {
  const panel = el('exec-byok');
  panel.replaceChildren();

  try {
    const { keys = [] } = await fetchJson('/api/byok/keys');
    const savedMap = Object.fromEntries(keys.map(k => [k.provider, k]));

    BYOK_PROVIDERS.forEach(prov => {
      const saved = savedMap[prov.key];
      const section = document.createElement('div');
      section.className = 'byok-provider';

      const header = document.createElement('div');
      header.className = 'byok-provider-header';

      const title = document.createElement('strong');
      title.className = 'byok-provider-name';
      title.textContent = prov.name;

      const status = document.createElement('span');
      status.className = `byok-status ${saved ? 'byok-ok' : 'byok-none'}`;
      status.textContent = saved ? `● ${saved.maskedKey}` : '● 未配置';
      status.id = `byok-status-${prov.key}`;

      header.append(title, status);

      const form = document.createElement('div');
      form.className = 'byok-form';

      const input = document.createElement('input');
      input.type = 'password';
      input.placeholder = prov.hint;
      input.className = 'field-input';
      input.style.flex = '1';
      input.value = '';
      input.id = `byok-input-${prov.key}`;

      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn btn-primary btn-sm';
      saveBtn.textContent = '保存';
      saveBtn.addEventListener('click', () => saveByokKey(prov.key, input));

      const testBtn = document.createElement('button');
      testBtn.className = 'btn btn-sm';
      testBtn.textContent = '测试';
      testBtn.disabled = !saved;
      testBtn.id = `byok-test-${prov.key}`;
      testBtn.addEventListener('click', () => testByokKey(prov.key, testBtn, status));

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sm btn-danger';
      delBtn.textContent = '删除';
      delBtn.hidden = !saved;
      delBtn.id = `byok-del-${prov.key}`;
      delBtn.addEventListener('click', () => deleteByokKey(prov.key));

      form.append(input, saveBtn, testBtn, delBtn);
      section.append(header, form);
      panel.appendChild(section);
    });

    // 模型选择提示
    const note = document.createElement('p');
    note.className = 'meta';
    note.style.marginTop = '16px';
    note.textContent = '配置 API Key 后，BYOK 模式下的任务将直接调用 API（轻量模式，无工具调用）。';
    panel.appendChild(note);

  } catch (e) {
    const error = document.createElement('p');
    error.className = 'meta';
    error.textContent = `加载失败：${e.message}`;
    panel.replaceChildren(error);
  }
}

async function saveByokKey(provider, inputEl) {
  const key = inputEl.value.trim();
  if (!key) { showToast('请输入 API Key'); return; }
  try {
    const { maskedKey } = await fetchJson('/api/byok/keys', {
      method: 'POST',
      body: JSON.stringify({ provider, key })
    });
    inputEl.value = '';
    const status = el(`byok-status-${provider}`);
    if (status) { status.textContent = `● ${maskedKey}`; status.className = 'byok-status byok-ok'; }
    const testBtn = el(`byok-test-${provider}`);
    if (testBtn) testBtn.disabled = false;
    const delBtn = el(`byok-del-${provider}`);
    if (delBtn) delBtn.hidden = false;
    showToast('Key 已保存', 'success');
  } catch (e) {
    showToast(e.message || '保存失败');
  }
}

async function testByokKey(provider, btnEl, statusEl) {
  const orig = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = '测试中…';
  try {
    const { ok, model, error } = await fetchJson(`/api/byok/${provider}/test`, { method: 'POST' });
    if (ok) {
      showToast(`✓ 连通正常 · ${model}`, 'success');
      if (statusEl) statusEl.style.color = 'var(--success)';
    } else {
      showToast(`✗ ${error || '连接失败'}`);
    }
  } catch (e) {
    showToast(e.message || '测试失败');
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = orig;
  }
}

async function deleteByokKey(provider) {
  try {
    await fetchJson(`/api/byok/keys/${provider}`, { method: 'DELETE' });
    const status = el(`byok-status-${provider}`);
    if (status) { status.textContent = '● 未配置'; status.className = 'byok-status byok-none'; }
    const testBtn = el(`byok-test-${provider}`);
    if (testBtn) testBtn.disabled = true;
    const delBtn = el(`byok-del-${provider}`);
    if (delBtn) delBtn.hidden = true;
    showToast('Key 已删除', 'success');
  } catch (e) {
    showToast(e.message || '删除失败');
  }
}

// ── 主输入框 ─────────────────────────────────────────────────────────────────

document.querySelectorAll('.pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    state.selectedType = pill.dataset.type;
    state.selectedMode = pill.dataset.mode || 'full';
  });
});

el('main-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    el('main-submit').click();
  }
});

el('main-submit').addEventListener('click', () => {
  const text = el('main-input').value.trim();
  if (!text) { el('main-input').focus(); return; }
  openLaunchDialog(text, state.selectedType);
});

const globalSearch = el('global-search');
if (globalSearch) {
  globalSearch.addEventListener('input', () => {
    state.searchQuery = globalSearch.value;
    const filtered = getSearchFilteredData();
    renderProjectCards(filtered.projects, filtered.runs);
    renderSidebar(filtered.projects, filtered.runs);
  });
}

document.querySelectorAll('[data-shell-panel]').forEach(item => {
  item.addEventListener('click', () => {
    const panel = item.dataset.shellPanel;
    if (panel === 'dashboard') {
      state.searchQuery = '';
      state.selectedProjectName = null;
      state.selectedProjectDetail = null;
      closeWorkspacePanel();
      if (globalSearch) globalSearch.value = '';
      renderFilteredHome();
      return;
    }
    openWorkspacePanel(panel);
  });
});

el('workspace-panel-back')?.addEventListener('click', () => {
  closeWorkspacePanel();
});

el('project-detail-back')?.addEventListener('click', () => {
  state.selectedProjectName = null;
  state.selectedProjectDetail = null;
  showMainView('home');
});

el('project-detail-refresh')?.addEventListener('click', () => {
  if (state.selectedProjectName) loadProjectDetail(state.selectedProjectName);
});

el('project-detail-iterate')?.addEventListener('click', () => {
  if (state.selectedProjectName) openIterateDialog(state.selectedProjectName);
});

// ── 启动对话框 ────────────────────────────────────────────────────────────────

const launchState = { mode: 'project', commandType: 'go', selectedMode: 'full', text: '' };

function setLaunchModeNote(text) {
  const simpleSection = el('launch-simple-section');
  if (!simpleSection) return;
  const note = document.createElement('p');
  note.className = 'launch-mode-note';
  note.textContent = text;
  simpleSection.replaceChildren(note);
}

async function openLaunchDialog(text, pillType) {
  launchState.text = text;
  launchState.commandType = pillType;

  const dialog = el('launch-dialog');
  el('launch-preview').textContent = text;
  el('launch-project').value = '';
  el('launch-goal').value = '';
  el('launch-criteria').value = '';

  const submitBtn = el('launch-submit-btn');
  submitBtn.disabled = false;

  // 根据模式切换表单内容
  const mode = state.selectedMode || 'full';
  const projectSection = el('launch-project-section');
  const simpleSection = el('launch-simple-section');

  if (mode === 'analyze') {
    // 需求梳理 → 简化表单
    if (simpleSection) simpleSection.hidden = false;
    if (projectSection) projectSection.hidden = true;
    submitBtn.textContent = '开始分析';
    setLaunchModeNote('AI 将分析需求并输出结构化文档，不编写代码。适合项目启动前的需求梳理阶段。');
    setLaunchMode('simple');
  } else if (mode === 'fix') {
    // 快速修复 → 简化表单
    if (simpleSection) simpleSection.hidden = false;
    if (projectSection) projectSection.hidden = true;
    submitBtn.textContent = '开始修复';
    setLaunchModeNote('AI 将分析现有代码并定位问题，以最小改动修复 Bug。适合线上问题快速响应。');
    setLaunchMode('simple');
  } else {
    // 完整开发 → 完整表单
    if (simpleSection) simpleSection.hidden = true;
    if (projectSection) projectSection.hidden = false;
    submitBtn.textContent = '启动';
    setLaunchMode('project');
  }

  // 乐观渲染：先打开对话框，再异步分类
  renderIntentBadge({ mode: 'uncertain', label: '分析中…', description: '' });
  loadContextPack('company', 'default', 'launch-context-preview');
  dialog.removeAttribute('hidden');
  if (dialog.showModal) dialog.showModal();

  try {
    const result = await fetchJson('/api/intent/classify', {
      method: 'POST',
      body: JSON.stringify({ prompt: text })
    });
    renderIntentBadge(result);
    if (mode === 'full' && result.mode === 'simple') {
      setLaunchMode('simple');
    }
    // 猜项目名
    const guess = text.replace(/[，。！？\s]+/g, '-').replace(/[^a-zA-Z0-9一-龥-]/g, '').slice(0, 20);
    if (guess && !el('launch-project').value) el('launch-project').value = guess;
  } catch {
    renderIntentBadge({ mode: 'uncertain', label: '待确认', description: '请选择执行模式' });
  }
}

function renderIntentBadge(result) {
  const container = el('intent-badge-row');
  if (!container) return;
  container.replaceChildren();

  const modeColors = { simple: 'var(--success)', project: 'var(--primary)', uncertain: 'var(--warning)' };
  const color = modeColors[result.mode] || 'var(--text-muted)';

  const badge = document.createElement('span');
  badge.style.cssText = `display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:${color};`;
  badge.textContent = `● ${result.label}`;

  const desc = document.createElement('span');
  desc.style.cssText = 'font-size:12px;color:var(--text-muted);';
  desc.textContent = result.description || '';

  container.append(badge, desc);
}

function setLaunchMode(mode) {
  launchState.mode = mode;
  const simpleSection = el('launch-simple-section');
  const projectSection = el('launch-project-section');
  const submitBtn = el('launch-submit-btn');

  document.querySelectorAll('.launch-mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });

  if (mode === 'simple') {
    if (simpleSection) simpleSection.hidden = false;
    if (projectSection) projectSection.hidden = true;
    if (submitBtn) submitBtn.textContent = '立即生成';
  } else {
    if (simpleSection) simpleSection.hidden = true;
    if (projectSection) projectSection.hidden = false;
    if (submitBtn) submitBtn.textContent = '启动';
    // 猜项目名
    if (!el('launch-project').value) {
      const guess = launchState.text.replace(/[，。！？\s]+/g, '-').replace(/[^a-zA-Z0-9一-龥-]/g, '').slice(0, 20);
      if (guess) el('launch-project').value = guess;
    }
  }
}

el('launch-cancel').addEventListener('click', () => {
  el('launch-dialog').close?.();
});

document.querySelectorAll('.launch-mode-btn').forEach(b => {
  b.addEventListener('click', () => setLaunchMode(b.dataset.mode));
});

el('launch-form').addEventListener('submit', async e => {
  e.preventDefault();
  const text = launchState.text;
  const mode = launchState.mode;

  let projectName, commandType, prompt;

  if (mode === 'simple') {
    // 快速修复 或 需求梳理
    projectName = `quick-${Date.now().toString(36)}`;
    commandType = launchState.commandType;
    const modeLabel = state.selectedMode === 'analyze' ? '需求梳理' : '快速修复';
    prompt = `快速生成任务（${modeLabel}模式）：\n\n${text}\n\n请直接输出结果，不需要经过多阶段审批。`;
  } else {
    projectName = el('launch-project').value.trim();
    if (!projectName) { el('launch-project').focus(); return; }
    commandType = launchState.commandType;
    const goal = el('launch-goal').value.trim();
    const criteria = el('launch-criteria').value.split('\n').map(s => s.trim()).filter(Boolean);
    prompt = `在 ${projectName} 中执行 /${commandType}。遵守项目 CLAUDE.md、governance 规则和 Codex 双审要求。\n\n## 需求\n${text}`;
    if (goal) prompt += `\n\n## 任务目标\n${goal}`;
    if (criteria.length) prompt += `\n\n## 验收标准\n${criteria.map(l => `- ${l}`).join('\n')}`;
  }

  const submitBtn = el('launch-submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = '启动中…';

  try {
    setStatusDot('loading');
    await fetchJson('/api/runs', {
      method: 'POST',
      body: JSON.stringify({ commandType, targetName: projectName, prompt })
    });
    const ld = el('launch-dialog');
    ld.close?.();
    el('main-input').value = '';
    setStatusDot('ok');
    showToast(`已启动 ${mode === 'simple' ? '简单生成' : `/${commandType}`} · ${projectName}`, 'success');
    // 自动打开运行详情面板（轮询等待 run 写入 DB）
    const waitForRun = async () => {
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 250));
        try {
          const { runs = [] } = await fetchJson('/api/runs');
          const latest = runs.find(r => r.targetName === projectName && (Date.now() - new Date(r.startedAt).getTime()) < 10000);
          if (latest) { openRunDetail(latest); return; }
        } catch { /* ignore */ }
      }
    };
    waitForRun();
    await loadHomePage();
  } catch (err) {
    setStatusDot('error');
    showToast(err.message || '启动失败');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = mode === 'simple' ? '立即生成' : '启动';
  }
});

// ── 仪表盘（进设置→成本面板）────────────────────────────────────────────────

async function loadDashboard() {
  try {
    const [data, costData] = await Promise.all([
      fetchJson('/api/dashboard'),
      fetchJson('/api/stats/costs').catch(() => null)
    ]);
    state.costSummary = costData;
    updateStatusbar(state.projects, state.runs);
    const s = data.summary || {};
    el('total-projects').textContent = s.totalProjects ?? 0;
    el('active-agents').textContent = s.activeAgents ?? 0;
    el('blocked-projects').textContent = s.blockedProjects ?? 0;
    if (costData) el('total-cost').textContent = (costData.totalCostCents || 0).toFixed(2);
    renderBlockers(data.blockers || [], data.failingGates || []);
    if (costData) renderCostChart(costData.byCommandType || []);
  } catch (e) {
    showToast(e.message || '加载成本数据失败');
  }
}

function renderBlockers(blockers, gates) {
  const list = el('blockers-list');
  list.replaceChildren();
  if (!blockers.length && !gates.length) { list.appendChild(empty('没有阻塞或失败 Gate')); return; }
  [...blockers.map(b => ({ title: `${b.projectName} · ${b.agent}`, meta: b.reason, status: 'fail' })),
   ...gates.map(g => ({ title: `${g.projectName} · ${g.gate}`, meta: g.evidencePath || '', status: g.status }))
  ].forEach(item => {
    const div = document.createElement('div');
    div.className = 'item';
    const info = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'item-title';
    title.textContent = item.title;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = item.meta;
    info.append(title, meta);
    div.append(info, badge(item.status, item.status));
    list.appendChild(div);
  });
}

function renderCostChart(byCommandType) {
  const chart = el('cost-chart');
  if (!chart) return;
  chart.replaceChildren();
  if (!byCommandType.length) { chart.appendChild(empty('暂无成本数据')); return; }
  const maxTokens = Math.max(...byCommandType.map(r => (r.totalTokenIn || 0) + (r.totalTokenOut || 0)), 1);
  byCommandType.forEach(row => {
    const total = (row.totalTokenIn || 0) + (row.totalTokenOut || 0);
    const pct = Math.round((total / maxTokens) * 100);
    const inPct = total > 0 ? Math.round(((row.totalTokenIn || 0) / total) * pct) : 0;
    const rowEl = document.createElement('div');
    rowEl.className = 'cost-row';
    const label = document.createElement('div');
    label.className = 'cost-label';
    label.textContent = row.commandType || 'unknown';
    const barWrap = document.createElement('div');
    barWrap.className = 'cost-bar-wrap';
    const barIn = document.createElement('div');
    barIn.className = 'cost-bar-in';
    barIn.style.width = `${inPct}%`;
    const barOut = document.createElement('div');
    barOut.className = 'cost-bar-out';
    barOut.style.width = `${pct - inPct}%`;
    barWrap.append(barIn, barOut);
    const meta = document.createElement('div');
    meta.className = 'cost-meta';
    meta.textContent = `${(row.totalCostCents || 0).toFixed(2)}¢ · ${row.runCount}`;
    rowEl.append(label, barWrap, meta);
    chart.appendChild(rowEl);
  });
}

el('refresh-dashboard').addEventListener('click', loadDashboard);

// ── 流水线 ────────────────────────────────────────────────────────────────────

const PHASES = ['intake', 'design', 'build', 'qa', 'review', 'security', 'devops', 'done'];

async function loadPipeline() {
  const container = el('pipeline-projects');
  container.replaceChildren();
  try {
    const data = await fetchJson('/api/projects');
    const projects = data.projects || [];
    if (!projects.length) { container.appendChild(empty('暂无项目')); return; }
    projects.forEach(project => container.appendChild(renderPipelineCard(project)));
  } catch (e) {
    container.appendChild(empty(e.message));
  }
}

function renderPipelineCard(project) {
  const card = document.createElement('div');
  card.className = 'pipeline-card';
  const header = document.createElement('div');
  header.className = 'pipeline-card-header';
  const nameEl = document.createElement('div');
  nameEl.className = 'pipeline-project-name';
  nameEl.textContent = project.name;
  header.appendChild(nameEl);
  header.appendChild(badge(project.complexity || 'unknown'));
  card.appendChild(header);
  const track = document.createElement('div');
  track.className = 'phase-track';
  const currentPhase = project.phase || 'intake';
  const currentIdx = PHASES.indexOf(currentPhase);
  PHASES.forEach((phase, i) => {
    const step = document.createElement('div');
    let stepClass = '';
    if (i < currentIdx) stepClass = 'done';
    else if (i === currentIdx) stepClass = project.status === 'blocked' ? 'blocked' : 'active';
    step.className = `phase-step ${stepClass}`;
    const dot = document.createElement('div');
    dot.className = 'phase-dot';
    dot.textContent = i < currentIdx ? '✓' : String(i + 1);
    dot.addEventListener('click', async () => {
      const existing = step.querySelector('.phase-tooltip');
      if (existing) { existing.remove(); return; }
      try {
        const { gates = [] } = await fetchJson(`/api/gates?scopeType=project&scopeId=${encodeURIComponent(project.name)}`);
        const phaseGates = gates.filter(g => (g.gateName || g.name || '').toLowerCase().includes(phase));
        const tooltip = document.createElement('div');
        tooltip.className = 'phase-tooltip';
        tooltip.textContent = phaseGates.length ? phaseGates.map(g => `${g.gateName || g.name}: ${g.status}`).join('\n') : '无 Gate 数据';
        step.appendChild(tooltip);
        setTimeout(() => tooltip.remove(), 4000);
      } catch {}
    });
    const label = document.createElement('div');
    label.className = 'phase-label';
    label.textContent = phase;
    step.append(dot, label);
    track.appendChild(step);
  });
  card.appendChild(track);
  return card;
}

el('refresh-pipeline').addEventListener('click', loadPipeline);

// ── Agent 运行 ────────────────────────────────────────────────────────────────

async function loadRuns() {
  const list = el('agent-runs-list');
  list.replaceChildren();
  try {
    const { runs = [] } = await fetchJson('/api/runs');
    if (!runs.length) { list.appendChild(empty('暂无运行记录')); return; }
    runs.slice(0, 20).forEach(run => list.appendChild(renderRunRow(run)));
  } catch (e) {
    list.appendChild(empty(e.message));
  }
  loadApprovals();
}

async function loadApprovals() {
  try {
    const { approvals = [] } = await fetchJson('/api/approvals');
    state.approvalCount = approvals.length;
    updateStatusbar(state.projects, state.runs);
    const countEl = el('approvals-count');
    const badgeEl = el('approvals-count-badge');
    if (countEl) countEl.textContent = approvals.length;
    if (badgeEl) {
      badgeEl.textContent = approvals.length;
      badgeEl.hidden = approvals.length === 0;
    }
    renderApprovals(approvals);
  } catch { /* 静默 */ }
}

function renderApprovals(approvals) {
  const list = el('approvals-list');
  if (!list) return;
  list.replaceChildren();
  if (!approvals.length) { list.appendChild(empty('暂无待审批')); return; }
  approvals.forEach(ap => {
    const card = document.createElement('div');
    card.className = 'approval-card';
    const meta = document.createElement('div');
    meta.className = 'approval-meta';
    meta.textContent = `Run: ${ap.runId} · ${timeAgo(ap.createdAt)}`;
    const snapshot = document.createElement('pre');
    snapshot.className = 'approval-snapshot';
    snapshot.textContent = (ap.promptSnapshot || '').slice(0, 300);
    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.placeholder = '备注（可选）';
    noteInput.className = 'approval-note-input';
    const actions = document.createElement('div');
    actions.className = 'approval-actions';
    actions.append(
      btn('批准', 'btn btn-primary btn-sm', async () => {
        try { await fetchJson(`/api/approvals/${ap.id}/approve`, { method: 'POST', body: JSON.stringify({ note: noteInput.value.trim() || undefined }) }); loadApprovals(); }
        catch (e) { showToast(e.message || '批准失败'); }
      }),
      btn('拒绝', 'btn btn-danger btn-sm', async () => {
        try { await fetchJson(`/api/approvals/${ap.id}/reject`, { method: 'POST', body: JSON.stringify({ note: noteInput.value.trim() || undefined }) }); loadApprovals(); }
        catch (e) { showToast(e.message || '拒绝失败'); }
      }),
      noteInput
    );
    card.append(meta, snapshot, actions);
    list.appendChild(card);
  });
}

function renderRunRow(run) {
  const row = document.createElement('div');
  row.className = 'run-row';
  const info = document.createElement('div');
  info.className = 'run-row-info';
  const title = document.createElement('div');
  title.className = 'run-row-title';
  if (run.status === 'running') {
    const spinner = document.createElement('span');
    spinner.className = 'run-spinner';
    title.appendChild(spinner);
  }
  title.appendChild(document.createTextNode(`${run.commandType} ${run.targetName || ''}`));
  const meta = document.createElement('div');
  meta.className = 'run-row-meta';
  meta.textContent = timeAgo(run.startedAt || run.createdAt);
  info.append(title, meta);
  const actions = document.createElement('div');
  actions.className = 'run-row-actions';
  actions.appendChild(badge(run.status, run.status));
  if (run.logPath) actions.appendChild(btn('日志', 'btn btn-sm', () => openRunDetail(run)));
  row.append(info, actions);
  return row;
}

el('refresh-runs').addEventListener('click', loadRuns);

// ── 运行详情面板 ─────────────────────────────────────────────────────────────

function createPermissionRetryBar(buttonId) {
  const bar = document.createElement('div');
  bar.className = 'permission-retry-bar';
  const text = document.createElement('span');
  text.textContent = '权限不足，任务已暂停';
  const button = document.createElement('button');
  button.id = buttonId;
  button.className = 'btn btn-primary btn-sm';
  button.textContent = '批准并重试';
  bar.append(text, button);
  return bar;
}

function openRunDetail(run) {
  const panel = el('run-detail-panel');
  const transcript = el('run-transcript');
  const titleEl = el('run-detail-title');
  const statusEl = el('run-detail-status');
  const targetEl = el('run-detail-target');
  const timeEl = el('run-detail-time');
  const costEl = el('run-detail-cost');
  const inputRow = el('run-detail-input-row');

  titleEl.textContent = `${run.commandType}  ${run.targetName || ''}`;
  targetEl.textContent = run.targetName || '';
  timeEl.textContent = timeAgo(run.startedAt || run.createdAt);
  costEl.textContent = run.costCents ? `${(run.costCents / 100).toFixed(3)} USD` : '';
  setRunStatusBadge(statusEl, run.status);
  transcript.replaceChildren();
  state.activeTranscriptFilter = 'all';
  state.currentRunEvents = [];
  state.currentRunToolCounts = {};
  renderRunDetailOverview(run);
  renderRunAgentTimeline(run);
  renderRunToolSummary();
  renderPermissionActions(run);
  document.querySelectorAll('.transcript-filter-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === 'all'));
  inputRow.hidden = run.status !== 'running';
  state.activeRunId = run.id;
  panel.hidden = false;

  // 权限暂停状态：显示重试条
  let retryBar = panel.querySelector('.permission-retry-bar');
  if (retryBar) retryBar.remove();
  if (run.status === 'paused_permission') {
    retryBar = createPermissionRetryBar('permission-retry-btn');
    panel.insertBefore(retryBar, transcript);
    setTimeout(() => {
      const retryBtn = el('permission-retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', async () => {
          retryBtn.disabled = true;
          retryBtn.textContent = '重试中…';
          try {
            await fetchJson(`/api/runs/${run.id}/retry`, { method: 'POST' });
            retryBar.remove();
            showToast('已带权限绕过重试，等待新运行开始…', 'success');
            renderPermissionActions({ ...run, status: 'running' });
            setTimeout(() => loadHomePage(), 1000);
          } catch (e) {
            retryBtn.disabled = false;
            retryBtn.textContent = '批准并重试';
            showToast(e.message || '重试失败');
          }
        });
      }
    }, 100);
  }

  if (state.logSource) { state.logSource.close(); state.logSource = null; }

  const src = new EventSource(`/api/runs/${run.id}/stream`);
  state.logSource = src;

  src.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    renderTranscriptEvent(transcript, msg);
    renderRunToolSummary();
    applyTranscriptFilter();
    transcript.scrollTop = transcript.scrollHeight;

    // 检测权限相关错误，提示用户开启绕过
    if (msg.kind === 'text' && /permission|权限|denied|EACCES|EPERM|not allowed/i.test(msg.content || '')) {
      const bypassEnabled = el('bypass-toggle')?.checked;
      if (!bypassEnabled) {
        showToast('检测到权限错误。请在 设置 → 执行模式 → 权限绕过 中开启后再试。', 'error');
      }
    }

    if (msg.kind === 'done') {
      setRunStatusBadge(statusEl, msg.status);
      renderRunDetailOverview({ ...run, status: msg.status, costCents: msg.costUsd ? Number(msg.costUsd) * 100 : run.costCents });
      renderPermissionActions({ ...run, status: msg.status });
      if (msg.status === 'paused_permission') {
        // 流结束后检查 run 状态，如果是暂停则显示重试条
        const existingBar = panel.querySelector('.permission-retry-bar');
        if (!existingBar) {
          const bar = createPermissionRetryBar('permission-retry-btn2');
          panel.insertBefore(bar, transcript);
          setTimeout(() => {
            const btn = el('permission-retry-btn2');
            if (btn) btn.addEventListener('click', async () => {
              btn.disabled = true; btn.textContent = '重试中…';
              try {
                await fetchJson(`/api/runs/${state.activeRunId}/retry`, { method: 'POST' });
                bar.remove();
                showToast('已带权限绕过重试', 'success');
                setTimeout(() => loadHomePage(), 1000);
              } catch (e) { btn.disabled = false; btn.textContent = '批准并重试'; showToast(e.message); }
            });
          }, 100);
        }
        inputRow.hidden = true;
      }
      if (msg.status === 'completed' && msg.costUsd) {
        costEl.textContent = `${Number(msg.costUsd).toFixed(4)} USD`;
      }
      src.close();
      state.logSource = null;
      loadHomePage();
    }
    if (msg.kind === 'result' && msg.sessionId) {
      state.lastSessionId = msg.sessionId;
    }
  };

  src.onerror = () => { src.close(); state.logSource = null; };
}

function setRunStatusBadge(badgeEl, status) {
  badgeEl.textContent = status === 'paused_permission' ? '⏸ 等待权限' : status;
  badgeEl.className = 'run-detail-status-badge ' + (status || '');
}

function renderRunDetailOverview(run) {
  const container = el('run-detail-overview');
  if (!container) return;
  container.replaceChildren();
  const items = [
    ['命令', run.commandType || '—'],
    ['项目', run.targetName || '—'],
    ['状态', run.status || '—'],
    ['成本', run.costCents ? `${(run.costCents / 100).toFixed(3)} USD` : '—']
  ];
  items.forEach(([label, value]) => {
    const card = document.createElement('div');
    card.className = 'run-overview-card';
    const labelEl = document.createElement('span');
    labelEl.className = 'run-overview-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('strong');
    valueEl.className = 'run-overview-value';
    valueEl.textContent = value;
    card.append(labelEl, valueEl);
    container.appendChild(card);
  });
}

function renderRunAgentTimeline(run) {
  const container = el('run-agent-timeline');
  if (!container) return;
  container.replaceChildren();
  const project = state.projects.find(p => p.name === run.targetName);
  const activeAgent = PHASE_TO_AGENT[project?.phase || run.commandType] || 'intake-analyst';
  PIPELINE_AGENTS.forEach(agent => {
    const node = document.createElement('div');
    const idx = PIPELINE_AGENTS.indexOf(agent);
    const activeIdx = PIPELINE_AGENTS.indexOf(activeAgent);
    node.className = `run-agent-step${idx === activeIdx ? ' active' : idx < activeIdx ? ' done' : ''}`;
    node.textContent = agent.replace('-engineer', '').replace('-analyst', '').replace('-planner', '');
    container.appendChild(node);
  });
}

function renderRunToolSummary() {
  const container = el('run-tool-summary');
  if (!container) return;
  container.replaceChildren();
  const total = state.currentRunEvents.length;
  const toolUses = state.currentRunToolCounts.tool_use || 0;
  const toolResults = state.currentRunToolCounts.tool_result || 0;
  const text = state.currentRunToolCounts.text || 0;
  [['事件', total], ['文本', text], ['工具调用', toolUses], ['工具结果', toolResults]].forEach(([label, value]) => {
    const chip = document.createElement('span');
    chip.className = 'run-tool-chip';
    chip.textContent = `${label} ${value}`;
    container.appendChild(chip);
  });
}

function renderPermissionActions(run) {
  const container = el('run-permission-actions');
  if (!container) return;
  container.replaceChildren();
  const isPaused = run.status === 'paused_permission';
  container.hidden = !isPaused;
  if (!isPaused) return;
  const text = document.createElement('span');
  text.textContent = '权限不足导致任务暂停，可批准后重试，或先检查执行模式设置。';
  const retry = btn('批准并重试', 'btn btn-primary btn-sm', async () => {
    retry.disabled = true;
    retry.textContent = '重试中…';
    try {
      await fetchJson(`/api/runs/${run.id}/retry`, { method: 'POST' });
      showToast('已带权限绕过重试', 'success');
      renderPermissionActions({ ...run, status: 'running' });
      setTimeout(() => loadHomePage(), 1000);
    } catch (e) {
      retry.disabled = false;
      retry.textContent = '批准并重试';
      showToast(e.message || '重试失败');
    }
  });
  const settings = btn('打开执行模式', 'btn btn-sm', () => openSettingsDrawer('cli'));
  container.append(text, retry, settings);
}

function applyTranscriptFilter() {
  const filter = state.activeTranscriptFilter;
  document.querySelectorAll('#run-transcript .transcript-block').forEach(block => {
    const kind = block.dataset.kind || 'text';
    const content = block.textContent || '';
    const matchesPermission = /permission|权限|denied|EACCES|EPERM|not allowed/i.test(content);
    block.hidden = !(filter === 'all' || kind === filter || (filter === 'permission' && matchesPermission));
  });
}

function renderTranscriptEvent(container, msg) {
  state.currentRunEvents.push(msg);
  state.currentRunToolCounts[msg.kind || 'unknown'] = (state.currentRunToolCounts[msg.kind || 'unknown'] || 0) + 1;
  const block = document.createElement('div');
  block.className = 'transcript-block';
  block.dataset.kind = msg.kind || 'text';

  if (msg.kind === 'text') {
    const p = document.createElement('div');
    p.className = 'transcript-text';
    p.textContent = msg.content;
    block.appendChild(p);
    container.appendChild(block);
    return;
  }

  if (msg.kind === 'tool_use') {
    const header = document.createElement('div');
    header.className = 'transcript-tool-header';
    const icon = document.createElement('span');
    icon.className = 'transcript-tool-icon';
    icon.textContent = msg.name;
    const input = document.createElement('div');
    input.className = 'transcript-tool-input';
    input.textContent = msg.input || '';
    header.appendChild(icon);
    block.append(header, input);
    container.appendChild(block);
    return;
  }

  if (msg.kind === 'tool_result') {
    const result = document.createElement('div');
    result.className = 'transcript-tool-result';
    result.textContent = msg.output || '';
    block.appendChild(result);
    container.appendChild(block);
    return;
  }

  if (msg.kind === 'result') {
    const rb = document.createElement('div');
    rb.className = `transcript-result-block ${msg.status === 'success' ? 'success' : 'failed'}`;
    rb.textContent = msg.status === 'success'
      ? `✓ 完成${msg.costUsd ? ` · ${Number(msg.costUsd).toFixed(4)} USD` : ''}`
      : `✗ 失败`;
    block.appendChild(rb);
    container.appendChild(block);
    return;
  }

  // msg.kind === 'done' 只更新 header，不在 transcript 里渲染
}

el('run-detail-close').addEventListener('click', () => {
  if (state.logSource) { state.logSource.close(); state.logSource = null; }
  el('run-detail-panel').hidden = true;
  state.activeRunId = null;
});

el('run-detail-send').addEventListener('click', async () => {
  const input = el('run-detail-input');
  const message = input.value.trim();
  if (!message || !state.activeRunId) return;
  try {
    await fetchJson(`/api/runs/${state.activeRunId}/resume`, { method: 'POST', body: JSON.stringify({ message }) });
    input.value = '';
    const line = document.createElement('div');
    line.style.cssText = 'color:var(--primary);margin-top:4px;font-style:italic;';
    line.textContent = `▶ ${message}`;
    el('run-transcript').appendChild(line);
    el('run-transcript').scrollTop = el('run-transcript').scrollHeight;
  } catch (e) { showToast(e.message || '发送失败'); }
});

el('run-detail-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el('run-detail-send').click(); }
});

document.querySelectorAll('.transcript-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.activeTranscriptFilter = btn.dataset.filter || 'all';
    document.querySelectorAll('.transcript-filter-btn').forEach(item => item.classList.toggle('active', item === btn));
    applyTranscriptFilter();
  });
});


// ── 记忆中心 ──────────────────────────────────────────────────────────────────

function switchMemoryTab(tab) {
  state.activeMemoryTab = tab;
  document.querySelectorAll('.memory-nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  el('memory-facts-panel').hidden = tab !== 'facts';
  el('memory-episodes-panel').hidden = tab !== 'episodes';
  el('memory-events-panel').hidden = tab !== 'events';
  el('memory-pack-panel').hidden = tab !== 'pack';
}

document.querySelectorAll('.memory-nav-item').forEach(b => {
  b.addEventListener('click', () => switchMemoryTab(b.dataset.tab));
});

async function loadMemory() {
  try {
    const [evData, epData, factsData] = await Promise.all([
      fetchJson('/api/memory/events?limit=20'),
      fetchJson('/api/memory/episodes?limit=20'),
      fetchJson('/api/memory/facts?status=active&limit=30')
    ]);
    renderFacts(factsData.facts || []);
    renderEpisodes(epData.episodes || []);
    renderEvents(evData.events || []);
    const fc = el('facts-count');
    const ec = el('episodes-count');
    const evc = el('events-count');
    if (fc) fc.textContent = factsData.total ?? factsData.facts?.length ?? 0;
    if (ec) ec.textContent = epData.total ?? epData.episodes?.length ?? 0;
    if (evc) evc.textContent = evData.total ?? evData.events?.length ?? 0;
  } catch (e) { showToast(e.message || '加载记忆失败'); }
  try {
    const data = await fetchJson('/api/memory/packs?scopeType=company&scopeId=default&limit=1');
    renderPack((data.packs || [])[0]);
  } catch { el('memory-pack-panel').replaceChildren(empty('暂无 Retrieval Pack')); }
}

document.addEventListener('change', async e => {
  if (e.target?.id === 'facts-type-filter') {
    try { const d = await fetchJson('/api/memory/facts?status=active&limit=30'); renderFacts(d.facts || []); }
    catch {}
  }
});

function renderFacts(facts) {
  const panel = el('memory-facts-panel');
  const filterSelect = el('facts-type-filter');
  if (filterSelect) {
    const currentVal = filterSelect.value;
    const types = [...new Set(facts.map(f => f.factType).filter(Boolean))];
    while (filterSelect.options.length > 1) filterSelect.remove(1);
    types.forEach(t => { const opt = document.createElement('option'); opt.value = t; opt.textContent = t; filterSelect.appendChild(opt); });
    if (currentVal) filterSelect.value = currentVal;
  }
  const filterVal = filterSelect ? filterSelect.value : '';
  const filtered = filterVal ? facts.filter(f => f.factType === filterVal) : facts;
  const filterRow = panel.querySelector('.facts-filter-row');
  panel.replaceChildren();
  if (filterRow) panel.appendChild(filterRow);
  if (!filtered.length) { panel.appendChild(empty('暂无 Fact')); return; }
  filtered.forEach(fact => {
    const card = document.createElement('div');
    card.className = 'memory-fact-card';
    const header = document.createElement('div');
    header.className = 'memory-fact-card-header';
    const typeBadge = document.createElement('span');
    typeBadge.className = 'fact-type-badge';
    typeBadge.textContent = fact.factType || 'unknown';
    const rejectBtn = btn('拒绝', 'btn btn-sm btn-danger', async () => {
      try { await fetchJson(`/api/memory/facts/${fact.id}/reject`, { method: 'PATCH' }); loadMemory(); }
      catch (e) { showToast(e.message || '操作失败'); }
    });
    header.append(typeBadge, badge(fact.status, fact.status === 'active' ? 'completed' : 'fail'), rejectBtn);
    const content = document.createElement('div');
    content.style.cssText = 'font-size:13px;margin:8px 0 4px;';
    content.textContent = fact.content;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${fact.scopeType}/${fact.scopeId}`;
    const bar = document.createElement('div');
    bar.className = 'confidence-bar';
    const fill = document.createElement('div');
    fill.className = 'confidence-fill';
    fill.style.width = `${Math.round((fact.confidence || 0) * 100)}%`;
    bar.appendChild(fill);
    card.append(header, content, meta, bar);
    panel.appendChild(card);
  });
}

function renderEpisodes(episodes) {
  const panel = el('memory-episodes-panel');
  panel.replaceChildren();
  if (!episodes.length) { panel.appendChild(empty('暂无 Episode')); return; }
  episodes.forEach((ep, i) => {
    const card = document.createElement('div');
    card.className = 'memory-episode-card';
    const dot = document.createElement('div');
    dot.style.cssText = 'position:absolute;left:10px;top:14px;width:12px;height:12px;border-radius:50%;background:var(--primary);border:2px solid var(--bg);';
    if (i < episodes.length - 1) {
      const line = document.createElement('div');
      line.style.cssText = 'position:absolute;left:15px;top:26px;width:2px;bottom:-8px;background:var(--border);';
      card.appendChild(line);
    }
    const title = document.createElement('strong');
    title.style.cssText = 'font-size:13px;display:block;margin-bottom:4px;';
    title.textContent = ep.title || '（无标题）';
    const summary = document.createElement('div');
    summary.style.cssText = 'font-size:13px;color:var(--text-muted);margin-bottom:6px;';
    summary.textContent = ep.summary || '';
    card.append(dot, title, summary);
    if (ep.conclusion) {
      const c = document.createElement('div');
      c.style.cssText = 'font-size:12px;color:var(--success);background:rgba(63,185,80,0.08);border-radius:4px;padding:4px 8px;';
      c.textContent = `结论：${ep.conclusion}`;
      card.appendChild(c);
    }
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.style.marginTop = '6px';
    meta.textContent = `${ep.scopeType}/${ep.scopeId}`;
    card.appendChild(meta);
    panel.appendChild(card);
  });
}

function renderEvents(events) {
  const panel = el('memory-events-panel');
  panel.replaceChildren();
  if (!events.length) { panel.appendChild(empty('暂无事件')); return; }
  events.forEach(ev => {
    const card = document.createElement('div');
    card.className = 'memory-event-card';
    const header = document.createElement('div');
    header.className = 'memory-event-card-header';
    const title = document.createElement('strong');
    title.className = 'memory-event-title';
    title.textContent = ev.eventType;
    header.append(title, badge(ev.source));
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${ev.scopeType}/${ev.scopeId} · ${timeAgo(ev.occurredAt)}`;
    card.append(header, meta);
    panel.appendChild(card);
  });
}

function renderPack(pack) {
  const panel = el('memory-pack-panel');
  panel.replaceChildren();
  if (!pack) { panel.appendChild(empty('暂无 Retrieval Pack')); return; }
  const box = document.createElement('div');
  box.className = 'memory-pack-box';
  try {
    const content = typeof pack.content === 'string' ? JSON.parse(pack.content) : pack.content;
    const sections = [
      { key: 'taskGoal', label: '任务目标' }, { key: 'keyStatus', label: '关键状态' },
      { key: 'governanceSummary', label: '治理摘要' }, { key: 'excludedInfo', label: '已排除' }
    ];
    let text = '';
    sections.forEach(({ key, label }) => { if (content[key]) text += `## ${label}\n${content[key]}\n\n`; });
    if (content.recentEpisodes?.length) { text += `## 近期 Episodes（${content.recentEpisodes.length}）\n`; content.recentEpisodes.forEach(ep => { text += `- ${typeof ep === 'string' ? ep : (ep.title || JSON.stringify(ep))}\n`; }); text += '\n'; }
    if (content.activeFacts?.length) { text += `## Active Facts（${content.activeFacts.length}）\n`; content.activeFacts.forEach(f => { text += `- [${f.factType || ''}] ${f.content || JSON.stringify(f)}\n`; }); }
    box.textContent = text || JSON.stringify(content, null, 2);
  } catch { box.textContent = pack.content || ''; }
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.style.marginTop = '8px';
  meta.textContent = `生成：${new Date(pack.generatedAt).toLocaleString('zh-CN')}`;
  panel.append(box, meta);
}

el('memory-compress-btn').addEventListener('click', async () => {
  await triggerMemoryCompress('company', 'default');
  setTimeout(loadMemory, 1000);
});
el('memory-event-toggle').addEventListener('click', () => { const f = el('memory-event-form'); f.hidden = !f.hidden; });
el('memory-event-cancel').addEventListener('click', () => { el('memory-event-form').hidden = true; el('memory-event-form').reset(); });
el('memory-event-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await fetchJson('/api/memory/events', { method: 'POST', body: JSON.stringify({ eventType: el('memory-event-type').value, scopeType: el('memory-scope-type').value, scopeId: el('memory-scope-id').value.trim(), payload: { message: el('memory-payload').value.trim() }, occurredAt: new Date().toISOString() }) });
    el('memory-event-form').hidden = true;
    el('memory-event-form').reset();
    loadMemory();
  } catch {}
});

// ── 重建索引 ──────────────────────────────────────────────────────────────────

el('rebuild-index').addEventListener('click', async () => {
  setStatusDot('loading');
  const btn = el('rebuild-index');
  btn.disabled = true;
  try {
    await fetchJson('/api/index/rebuild', { method: 'POST' });
    setStatusDot('ok');
    showToast('索引重建完成', 'success');
    await loadHomePage();
  } catch (e) {
    setStatusDot('error');
    showToast(e.message || '重建索引失败');
  } finally { btn.disabled = false; }
});

// ── 旧 dialog 关闭 ────────────────────────────────────────────────────────────

document.querySelectorAll('[data-close-dialog]').forEach(b => {
  b.addEventListener('click', () => {
    const d = b.closest('dialog');
    if (d) { d.close?.() || (d.hidden = true); }
  });
});

// ── 旧 products 树（legacy，保持 API 不断） ───────────────────────────────────

const PE = {
  productDialog: el('product-dialog'), productForm: el('product-form'), productName: el('product-name'),
  milestoneDialog: el('milestone-dialog'), milestoneForm: el('milestone-form'), milestoneProductId: el('milestone-product-id'), milestoneName: el('milestone-name'), milestoneTargetDate: el('milestone-target-date'),
  workstreamDialog: el('workstream-dialog'), workstreamForm: el('workstream-form'), workstreamMilestoneId: el('workstream-milestone-id'), workstreamName: el('workstream-name'), workstreamProjectName: el('workstream-project-name'),
  taskDialog: el('task-dialog'), taskForm: el('task-form'), taskWorkstreamId: el('task-workstream-id'), taskTitle: el('task-title'), taskAgentRole: el('task-agent-role'), taskAcceptance: el('task-acceptance')
};
function openDialog(d) { if (d?.showModal) d.showModal(); }
PE.productForm?.addEventListener('submit', async e => { e.preventDefault(); try { await fetchJson('/api/products', { method: 'POST', body: JSON.stringify({ name: PE.productName.value.trim() }) }); PE.productForm.reset(); PE.productDialog.close?.(); } catch {} });
PE.milestoneForm?.addEventListener('submit', async e => { e.preventDefault(); try { await fetchJson(`/api/products/${PE.milestoneProductId.value}/milestones`, { method: 'POST', body: JSON.stringify({ name: PE.milestoneName.value.trim(), targetDate: PE.milestoneTargetDate.value || null }) }); PE.milestoneForm.reset(); PE.milestoneDialog.close?.(); } catch {} });
PE.workstreamForm?.addEventListener('submit', async e => { e.preventDefault(); try { await fetchJson(`/api/milestones/${PE.workstreamMilestoneId.value}/workstreams`, { method: 'POST', body: JSON.stringify({ name: PE.workstreamName.value.trim(), projectName: PE.workstreamProjectName.value.trim() || null }) }); PE.workstreamForm.reset(); PE.workstreamDialog.close?.(); } catch {} });
PE.taskForm?.addEventListener('submit', async e => { e.preventDefault(); try { await fetchJson(`/api/workstreams/${PE.taskWorkstreamId.value}/tasks`, { method: 'POST', body: JSON.stringify({ title: PE.taskTitle.value.trim(), agentRole: PE.taskAgentRole.value, acceptanceRef: PE.taskAcceptance.value.trim() || null }) }); PE.taskForm.reset(); PE.taskDialog.close?.(); } catch {} });

// ── 技能商店 (M5) ────────────────────────────────────────────────────────────

let skillsData = [];
let skillCatFilter = '';

async function loadSkills() {
  try {
    const { skills = [] } = await fetchJson('/api/skills');
    skillsData = skills;
    renderSkills();
    updateSkillCount();
  } catch (e) {
    el('skill-list').replaceChildren(empty(`加载失败：${e.message}`));
  }
}

function updateSkillCount() {
  const c = el('skills-installed-count');
  if (!c) return;
  const n = skillsData.filter(s => s.installed).length;
  c.textContent = n > 0 ? `已安装 ${n} 个` : '';
}

function renderSkills() {
  const list = el('skill-list');
  list.replaceChildren();
  const filtered = skillCatFilter
    ? skillsData.filter(s => s.category === skillCatFilter)
    : skillsData;
  if (!filtered.length) { list.appendChild(empty('暂无技能')); return; }
  filtered.forEach(skill => list.appendChild(renderSkillCard(skill, 'skill')));
}

function renderSkillCard(item, type) {
  const card = document.createElement('div');
  card.className = `skill-card${item.installed ? ' skill-installed' : ''}`;

  const left = document.createElement('div');
  left.className = 'skill-card-left';

  const icon = document.createElement('div');
  icon.className = 'skill-icon';
  icon.textContent = item.icon;

  const info = document.createElement('div');
  info.className = 'skill-info';

  const nameLine = document.createElement('div');
  nameLine.className = 'skill-name';
  nameLine.textContent = item.name;

  const descLine = document.createElement('div');
  descLine.className = 'skill-desc';
  descLine.textContent = item.description;

  const tagsLine = document.createElement('div');
  tagsLine.className = 'skill-tags';

  if (type === 'skill') {
    const catTag = document.createElement('span');
    catTag.className = 'skill-tag';
    catTag.textContent = item.category;
    tagsLine.appendChild(catTag);
    (item.tags || []).forEach(t => {
      const tag = document.createElement('span');
      tag.className = 'skill-tag';
      tag.textContent = t;
      tagsLine.appendChild(tag);
    });
  } else {
    const pkgTag = document.createElement('span');
    pkgTag.className = 'skill-tag skill-tag-pkg';
    pkgTag.textContent = item.package;
    tagsLine.appendChild(pkgTag);
    if (item.official) {
      const offTag = document.createElement('span');
      offTag.className = 'skill-tag skill-tag-official';
      offTag.textContent = '官方';
      tagsLine.appendChild(offTag);
    }
  }

  info.append(nameLine, descLine, tagsLine);
  left.append(icon, info);

  const right = document.createElement('div');
  right.className = 'skill-card-right';

  if (type === 'mcp' && item.installNote) {
    const note = document.createElement('div');
    note.className = 'skill-note';
    note.textContent = item.installNote;
    right.appendChild(note);
  }

  const toggleBtn = document.createElement('button');
  toggleBtn.className = item.installed
    ? 'btn btn-sm skill-uninstall-btn'
    : 'btn btn-primary btn-sm';
  toggleBtn.textContent = item.installed ? '卸载' : '安装';
  toggleBtn.addEventListener('click', () => toggleSkill(item, type, toggleBtn, card));
  right.appendChild(toggleBtn);

  card.append(left, right);
  return card;
}

async function toggleSkill(item, type, btnEl, cardEl) {
  const installing = !item.installed;
  btnEl.disabled = true;
  btnEl.textContent = installing ? '安装中…' : '卸载中…';

  const url = type === 'skill'
    ? (installing ? `/api/skills/${item.key}/install` : `/api/skills/${item.key}`)
    : (installing ? `/api/mcps/${item.key}/install` : `/api/mcps/${item.key}`);
  const method = installing ? 'POST' : 'DELETE';

  try {
    await fetchJson(url, { method });
    item.installed = installing;
    cardEl.classList.toggle('skill-installed', installing);
    btnEl.textContent = installing ? '卸载' : '安装';
    btnEl.className = installing ? 'btn btn-sm skill-uninstall-btn' : 'btn btn-primary btn-sm';
    if (type === 'skill') updateSkillCount();
    showToast(
      installing ? `已安装：${item.name}` : `已卸载：${item.name}`,
      installing ? 'success' : 'error'
    );
  } catch (e) {
    showToast(e.message || '操作失败');
  } finally {
    btnEl.disabled = false;
  }
}

document.querySelectorAll('.skill-cat-btn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.skill-cat-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    skillCatFilter = b.dataset.cat;
    renderSkills();
  });
});

// ── MCP 商店 (M5) ─────────────────────────────────────────────────────────────

async function loadMcps() {
  try {
    const { mcps = [] } = await fetchJson('/api/mcps');
    const list = el('mcp-list');
    list.replaceChildren();
    mcps.forEach(mcp => list.appendChild(renderSkillCard(mcp, 'mcp')));
  } catch (e) {
    el('mcp-list').replaceChildren(empty(`加载失败：${e.message}`));
  }
}

// ── 启动 ──────────────────────────────────────────────────────────────────────

loadHomePage();
scanLocalCLI();
loadBypassState();
