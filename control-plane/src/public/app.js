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

const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');

const productElements = {
  tree: document.getElementById('products-tree'),
  newProductBtn: document.getElementById('new-product-btn'),
  productDialog: document.getElementById('product-dialog'),
  productForm: document.getElementById('product-form'),
  productName: document.getElementById('product-name'),
  milestoneDialog: document.getElementById('milestone-dialog'),
  milestoneForm: document.getElementById('milestone-form'),
  milestoneProductId: document.getElementById('milestone-product-id'),
  milestoneName: document.getElementById('milestone-name'),
  milestoneTargetDate: document.getElementById('milestone-target-date'),
  workstreamDialog: document.getElementById('workstream-dialog'),
  workstreamForm: document.getElementById('workstream-form'),
  workstreamMilestoneId: document.getElementById('workstream-milestone-id'),
  workstreamName: document.getElementById('workstream-name'),
  workstreamProjectName: document.getElementById('workstream-project-name'),
  taskDialog: document.getElementById('task-dialog'),
  taskForm: document.getElementById('task-form'),
  taskWorkstreamId: document.getElementById('task-workstream-id'),
  taskTitle: document.getElementById('task-title'),
  taskAgentRole: document.getElementById('task-agent-role'),
  taskAcceptance: document.getElementById('task-acceptance')
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
  if (elements.statusMessage) elements.statusMessage.textContent = message;
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

function switchView(viewName) {
  navItems.forEach(item => item.classList.toggle('active', item.dataset.view === viewName));
  views.forEach(view => {
    const isActive = view.id === `view-${viewName}`;
    view.classList.toggle('active', isActive);
    view.hidden = !isActive;
  });

  if (viewName === 'dashboard') loadDashboard();
  if (viewName === 'products') loadProducts();
  if (viewName === 'iterations') loadCrs();
  if (viewName === 'memory') loadMemory();
}

function makeButton(label, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className || 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function openDialog(dialog) {
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
    return;
  }
  dialog.hidden = false;
}

function closeDialog(dialog) {
  if (typeof dialog.close === 'function') {
    dialog.close();
    return;
  }
  dialog.hidden = true;
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

async function loadProducts() {
  try {
    const data = await fetchJson('/api/products');
    const products = data.products || [];
    productElements.tree.replaceChildren();

    if (products.length === 0) {
      productElements.tree.appendChild(emptyMessage('暂无产品。'));
      return;
    }

    for (const product of products) {
      const tree = await fetchJson(`/api/products/${product.id}/tree`);
      productElements.tree.appendChild(renderProductNode(tree.product));
    }
  } catch (error) {
    productElements.tree.replaceChildren(emptyMessage(error.message));
  }
}

function renderProductNode(product) {
  const node = document.createElement('article');
  node.className = 'tree-node product-node';

  const header = document.createElement('div');
  header.className = 'tree-node-header';
  const title = document.createElement('strong');
  title.textContent = product.name;
  const actions = document.createElement('div');
  actions.className = 'node-actions';
  actions.append(
    createBadge(product.status || 'idea'),
    makeButton('新建 Milestone', 'button-small', () => {
      productElements.milestoneProductId.value = product.id;
      openDialog(productElements.milestoneDialog);
    })
  );
  header.append(title, actions);

  const children = document.createElement('div');
  children.className = 'tree-children';
  const milestones = product.milestones || [];
  if (milestones.length === 0) {
    children.appendChild(emptyMessage('暂无 Milestone。'));
  } else {
    milestones.forEach(milestone => children.appendChild(renderMilestoneNode(milestone)));
  }

  node.append(header, children);
  return node;
}

function renderMilestoneNode(milestone) {
  const node = document.createElement('section');
  node.className = 'tree-node milestone-node';
  const header = document.createElement('div');
  header.className = 'tree-node-header';
  const title = document.createElement('strong');
  title.textContent = milestone.name;
  const actions = document.createElement('div');
  actions.className = 'node-actions';
  actions.append(
    createBadge(milestone.status || 'planned'),
    makeButton('新建 Workstream', 'button-small', () => {
      productElements.workstreamMilestoneId.value = milestone.id;
      openDialog(productElements.workstreamDialog);
    })
  );
  header.append(title, actions);

  const children = document.createElement('div');
  children.className = 'tree-children';
  const workstreams = milestone.workstreams || [];
  if (workstreams.length === 0) {
    children.appendChild(emptyMessage('暂无 Workstream。'));
  } else {
    workstreams.forEach(workstream => children.appendChild(renderWorkstreamNode(workstream)));
  }

  node.append(header, children);
  return node;
}

function renderWorkstreamNode(workstream) {
  const node = document.createElement('section');
  node.className = 'tree-node workstream-node';
  const header = document.createElement('div');
  header.className = 'tree-node-header';
  const title = document.createElement('strong');
  title.textContent = workstream.projectName ? `${workstream.name} · ${workstream.projectName}` : workstream.name;
  const actions = document.createElement('div');
  actions.className = 'node-actions';
  actions.append(
    createBadge(workstream.status || 'todo'),
    makeButton('新建 Task', 'button-small', () => {
      productElements.taskWorkstreamId.value = workstream.id;
      openDialog(productElements.taskDialog);
    })
  );
  header.append(title, actions);

  const children = document.createElement('div');
  children.className = 'tree-children task-list';
  const tasks = workstream.tasks || [];
  if (tasks.length === 0) {
    children.appendChild(emptyMessage('暂无 Task。'));
  } else {
    tasks.forEach(task => children.appendChild(renderTaskNode(task)));
  }

  node.append(header, children);
  return node;
}

function renderTaskNode(task) {
  const row = document.createElement('div');
  row.className = 'task-row';
  const title = document.createElement('span');
  title.textContent = task.title;
  row.append(title, createBadge(task.status || 'backlog'));
  return row;
}

async function submitProduct(event) {
  event.preventDefault();
  await fetchJson('/api/products', {
    method: 'POST',
    body: JSON.stringify({ name: productElements.productName.value.trim() })
  });
  productElements.productForm.reset();
  closeDialog(productElements.productDialog);
  await loadProducts();
}

async function submitMilestone(event) {
  event.preventDefault();
  await fetchJson(`/api/products/${productElements.milestoneProductId.value}/milestones`, {
    method: 'POST',
    body: JSON.stringify({
      name: productElements.milestoneName.value.trim(),
      targetDate: productElements.milestoneTargetDate.value || null
    })
  });
  productElements.milestoneForm.reset();
  closeDialog(productElements.milestoneDialog);
  await loadProducts();
}

async function submitWorkstream(event) {
  event.preventDefault();
  await fetchJson(`/api/milestones/${productElements.workstreamMilestoneId.value}/workstreams`, {
    method: 'POST',
    body: JSON.stringify({
      name: productElements.workstreamName.value.trim(),
      projectName: productElements.workstreamProjectName.value.trim() || null
    })
  });
  productElements.workstreamForm.reset();
  closeDialog(productElements.workstreamDialog);
  await loadProducts();
}

async function submitTask(event) {
  event.preventDefault();
  await fetchJson(`/api/workstreams/${productElements.taskWorkstreamId.value}/tasks`, {
    method: 'POST',
    body: JSON.stringify({
      title: productElements.taskTitle.value.trim(),
      agentRole: productElements.taskAgentRole.value,
      acceptanceRef: productElements.taskAcceptance.value.trim() || null
    })
  });
  productElements.taskForm.reset();
  closeDialog(productElements.taskDialog);
  await loadProducts();
}

async function loadDashboard() {
  setLoading(true);
  setStatus('加载中');

  try {
    const dashboard = await fetchJson('/api/dashboard');
    state.dashboard = dashboard;
    renderDashboard(dashboard);
    await loadCrs();
    await loadMemory();
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

// ── 迭代中心 ──────────────────────────────────────────────

const crElements = {
  section: document.getElementById('cr-section'),
  newCrToggle: document.getElementById('new-cr-toggle'),
  crForm: document.getElementById('cr-form'),
  crFormCancel: document.getElementById('cr-form-cancel'),
  crList: document.getElementById('cr-list'),
  projectName: document.getElementById('cr-project-name'),
  title: document.getElementById('cr-title'),
  source: document.getElementById('cr-source'),
  scope: document.getElementById('cr-scope'),
  priority: document.getElementById('cr-priority'),
  currentBehavior: document.getElementById('cr-current-behavior'),
  expectedBehavior: document.getElementById('cr-expected-behavior'),
  acceptanceCriteria: document.getElementById('cr-acceptance-criteria')
};

const CR_STATUS_LABELS = {
  open: '待分析',
  ia_running: 'IA 运行中',
  ia_done: 'IA 完成',
  patch_pending: '待执行',
  patch_running: 'Patch 运行中',
  regression_running: '回归测试中',
  released: '已发布',
  cancelled: '已取消'
};

async function loadCrs() {
  try {
    const data = await fetchJson('/api/change-requests');
    renderCrList(data.changeRequests || []);
  } catch {
    // 静默失败，不影响主看板
  }
}

function renderCrList(crs) {
  crElements.crList.replaceChildren();
  if (crs.length === 0) {
    crElements.crList.appendChild(emptyMessage('暂无变更请求。'));
    return;
  }
  crs.forEach(cr => crElements.crList.appendChild(renderCrCard(cr)));
}

function renderCrCard(cr) {
  const card = document.createElement('article');
  card.className = 'cr-card';

  const header = document.createElement('div');
  header.className = 'cr-card-header';

  const title = document.createElement('span');
  title.className = 'cr-card-title';
  title.textContent = cr.title;

  const statusBadge = createBadge(CR_STATUS_LABELS[cr.status] || cr.status, cr.status);
  const priorityBadge = createBadge(cr.priority, 'priority');

  header.appendChild(title);
  header.appendChild(statusBadge);
  header.appendChild(priorityBadge);

  const meta = document.createElement('p');
  meta.className = 'cr-card-meta';
  meta.textContent = `${cr.projectName} · ${cr.source} · ${new Date(cr.createdAt).toLocaleString('zh-CN')}`;

  const actions = document.createElement('div');
  actions.className = 'cr-card-actions';

  if (cr.status === 'ia_done' || cr.status === 'patch_pending') {
    const execBtn = document.createElement('button');
    execBtn.className = 'button primary';
    execBtn.textContent = cr.status === 'patch_pending' ? '重新执行 Patch' : '执行 Patch';
    execBtn.addEventListener('click', () => executePatch(cr.id));
    actions.appendChild(execBtn);
  }

  if (cr.status !== 'released' && cr.status !== 'cancelled') {
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'button';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => cancelCr(cr.id));
    actions.appendChild(cancelBtn);
  }

  card.appendChild(header);
  card.appendChild(meta);
  if (actions.children.length > 0) card.appendChild(actions);

  return card;
}

async function executePatch(crId) {
  try {
    await fetchJson(`/api/change-requests/${crId}/execute-patch`, { method: 'POST' });
    setStatus('Patch 已启动');
    await loadCrs();
  } catch (error) {
    setStatus(error.message);
  }
}

async function cancelCr(crId) {
  try {
    await fetchJson(`/api/change-requests/${crId}/cancel`, { method: 'PATCH' });
    setStatus('变更请求已取消');
    await loadCrs();
  } catch (error) {
    setStatus(error.message);
  }
}

crElements.newCrToggle.addEventListener('click', () => {
  const hidden = crElements.crForm.hidden;
  crElements.crForm.hidden = !hidden;
  crElements.newCrToggle.textContent = hidden ? '收起' : '新建变更请求';
});

crElements.crFormCancel.addEventListener('click', () => {
  crElements.crForm.hidden = true;
  crElements.crForm.reset();
  crElements.newCrToggle.textContent = '新建变更请求';
});

crElements.crForm.addEventListener('submit', async event => {
  event.preventDefault();
  const criteria = crElements.acceptanceCriteria.value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  const payload = {
    projectName: crElements.projectName.value.trim(),
    title: crElements.title.value.trim(),
    source: crElements.source.value,
    scope: crElements.scope.value,
    priority: crElements.priority.value,
    currentBehavior: crElements.currentBehavior.value.trim(),
    expectedBehavior: crElements.expectedBehavior.value.trim(),
    acceptanceCriteria: criteria
  };

  try {
    await fetchJson('/api/change-requests', { method: 'POST', body: JSON.stringify(payload) });
    crElements.crForm.hidden = true;
    crElements.crForm.reset();
    crElements.newCrToggle.textContent = '新建变更请求';
    setStatus('变更请求已提交，IA 分析中');
    await loadCrs();
  } catch (error) {
    setStatus(error.message);
  }
});

// ── 记忆中心 ──────────────────────────────────────────────

const memoryElements = {
  compressBtn: document.getElementById('memory-compress-btn'),
  eventToggle: document.getElementById('memory-event-toggle'),
  eventForm: document.getElementById('memory-event-form'),
  eventCancel: document.getElementById('memory-event-cancel'),
  eventType: document.getElementById('memory-event-type'),
  scopeType: document.getElementById('memory-scope-type'),
  scopeId: document.getElementById('memory-scope-id'),
  payload: document.getElementById('memory-payload'),
  tabs: document.querySelectorAll('.memory-tab'),
  eventsPanel: document.getElementById('memory-events-panel'),
  episodesPanel: document.getElementById('memory-episodes-panel'),
  factsPanel: document.getElementById('memory-facts-panel'),
  packPanel: document.getElementById('memory-pack-panel')
};

let activeMemoryTab = 'events';

function switchMemoryTab(tab) {
  activeMemoryTab = tab;
  memoryElements.tabs.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  memoryElements.eventsPanel.hidden = tab !== 'events';
  memoryElements.episodesPanel.hidden = tab !== 'episodes';
  memoryElements.factsPanel.hidden = tab !== 'facts';
  memoryElements.packPanel.hidden = tab !== 'pack';
}

async function loadMemory() {
  try {
    const [eventsData, episodesData, factsData] = await Promise.all([
      fetchJson('/api/memory/events?limit=20'),
      fetchJson('/api/memory/episodes?limit=20'),
      fetchJson('/api/memory/facts?status=active&limit=20')
    ]);
    renderMemoryEvents(eventsData.events || []);
    renderMemoryEpisodes(episodesData.episodes || []);
    renderMemoryFacts(factsData.facts || []);
  } catch { /* 静默失败 */ }

  try {
    const pack = await fetchJson('/api/memory/packs/latest?scopeType=company&scopeId=default');
    renderMemoryPack(pack);
  } catch {
    memoryElements.packPanel.replaceChildren(emptyMessage('暂无 Retrieval Pack。'));
  }
}

function renderMemoryEvents(events) {
  memoryElements.eventsPanel.replaceChildren();
  if (events.length === 0) {
    memoryElements.eventsPanel.appendChild(emptyMessage('暂无事件记录。'));
    return;
  }
  events.forEach(ev => {
    const card = document.createElement('div');
    card.className = 'memory-event-card';
    card.innerHTML = `<strong>${ev.eventType}</strong> <span class="badge">${ev.source}</span>
      <div class="meta">${ev.scopeType}/${ev.scopeId} · ${new Date(ev.occurredAt).toLocaleString()}</div>`;
    memoryElements.eventsPanel.appendChild(card);
  });
}

function renderMemoryEpisodes(episodes) {
  memoryElements.episodesPanel.replaceChildren();
  if (episodes.length === 0) {
    memoryElements.episodesPanel.appendChild(emptyMessage('暂无 Episode。'));
    return;
  }
  episodes.forEach(ep => {
    const card = document.createElement('div');
    card.className = 'memory-episode-card';
    card.innerHTML = `<strong>${ep.title}</strong>
      <div>${ep.summary}</div>
      <div class="meta">${ep.scopeType}/${ep.scopeId} · ${ep.conclusion}</div>`;
    memoryElements.episodesPanel.appendChild(card);
  });
}

function renderMemoryFacts(facts) {
  memoryElements.factsPanel.replaceChildren();
  if (facts.length === 0) {
    memoryElements.factsPanel.appendChild(emptyMessage('暂无 Fact。'));
    return;
  }
  facts.forEach(fact => {
    const card = document.createElement('div');
    card.className = 'memory-fact-card';
    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'button';
    rejectBtn.textContent = '拒绝';
    rejectBtn.style.cssText = 'font-size:0.75rem;padding:2px 8px;margin-left:8px;';
    rejectBtn.addEventListener('click', () => rejectFact(fact.id));
    card.innerHTML = `<strong>${fact.factType}</strong> <span class="badge">${fact.status}</span>`;
    card.appendChild(rejectBtn);
    const content = document.createElement('div');
    content.textContent = fact.content;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${fact.scopeType}/${fact.scopeId} · confidence: ${fact.confidence}`;
    card.appendChild(content);
    card.appendChild(meta);
    memoryElements.factsPanel.appendChild(card);
  });
}

function renderMemoryPack(pack) {
  memoryElements.packPanel.replaceChildren();
  if (!pack) {
    memoryElements.packPanel.appendChild(emptyMessage('暂无 Retrieval Pack。'));
    return;
  }
  const box = document.createElement('div');
  box.className = 'memory-pack-box';
  try {
    const content = typeof pack.content === 'string' ? JSON.parse(pack.content) : pack.content;
    box.textContent = JSON.stringify(content, null, 2);
  } catch {
    box.textContent = pack.content || '';
  }
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.style.marginTop = '8px';
  meta.textContent = `生成时间：${new Date(pack.generatedAt).toLocaleString()} · 过期：${new Date(pack.expiresAt).toLocaleString()}`;
  memoryElements.packPanel.appendChild(box);
  memoryElements.packPanel.appendChild(meta);
}

async function rejectFact(factId) {
  try {
    await fetchJson(`/api/memory/facts/${factId}/reject`, { method: 'PATCH' });
    await loadMemory();
  } catch (err) {
    setStatus(err.message);
  }
}

async function submitMemoryEvent(event) {
  event.preventDefault();
  const payload = {
    eventType: memoryElements.eventType.value,
    scopeType: memoryElements.scopeType.value,
    scopeId: memoryElements.scopeId.value.trim(),
    payload: { message: memoryElements.payload.value.trim() },
    occurredAt: new Date().toISOString()
  };
  try {
    await fetchJson('/api/memory/events', { method: 'POST', body: JSON.stringify(payload) });
    memoryElements.eventForm.hidden = true;
    memoryElements.eventForm.reset();
    await loadMemory();
  } catch (err) {
    setStatus(err.message);
  }
}

async function triggerMemoryCompress() {
  try {
    await fetchJson('/api/memory/compress', {
      method: 'POST',
      body: JSON.stringify({ scopeType: 'company', scopeId: 'default' })
    });
    setStatus('记忆压缩已触发');
  } catch (err) {
    setStatus(err.message);
  }
}

navItems.forEach(item => {
  item.addEventListener('click', () => switchView(item.dataset.view));
});

document.querySelectorAll('[data-close-dialog]').forEach(btn => {
  btn.addEventListener('click', () => closeDialog(btn.closest('dialog')));
});

productElements.newProductBtn.addEventListener('click', () => openDialog(productElements.productDialog));
productElements.productForm.addEventListener('submit', event => {
  submitProduct(event).catch(error => setStatus(error.message));
});
productElements.milestoneForm.addEventListener('submit', event => {
  submitMilestone(event).catch(error => setStatus(error.message));
});
productElements.workstreamForm.addEventListener('submit', event => {
  submitWorkstream(event).catch(error => setStatus(error.message));
});
productElements.taskForm.addEventListener('submit', event => {
  submitTask(event).catch(error => setStatus(error.message));
});

memoryElements.eventToggle.addEventListener('click', () => {
  memoryElements.eventForm.hidden = !memoryElements.eventForm.hidden;
});
memoryElements.eventCancel.addEventListener('click', () => {
  memoryElements.eventForm.hidden = true;
  memoryElements.eventForm.reset();
});
memoryElements.eventForm.addEventListener('submit', submitMemoryEvent);
memoryElements.compressBtn.addEventListener('click', triggerMemoryCompress);
memoryElements.tabs.forEach(btn => {
  btn.addEventListener('click', () => switchMemoryTab(btn.dataset.tab));
});

loadDashboard();
