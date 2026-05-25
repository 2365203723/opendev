/* v8 ignore start */

// ── 状态 ──────────────────────────────────────────────────────────────────────

const state = {
  activeDrawerPanel: 'cli',
  activeMemoryTab: 'facts',
  logSource: null,
  approvalsTimer: null,
  selectedType: 'go',
  activeRunId: null,
  lastSessionId: null
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
    const [{ projects = [] }, { runs = [] }] = await Promise.all([
      fetchJson('/api/projects').catch(() => ({ projects: [] })),
      fetchJson('/api/runs').catch(() => ({ runs: [] }))
    ]);
    renderProjectCards(projects, runs);
    setStatusDot('ok');
  } catch (e) {
    setStatusDot('error');
    showToast(e.message || '加载失败');
  }
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

  // 按项目名聚合最新 run
  const runByProject = {};
  runs.forEach(r => {
    const key = r.targetName || '—';
    if (!runByProject[key] || new Date(r.startedAt) > new Date(runByProject[key].startedAt)) {
      runByProject[key] = r;
    }
  });

  // 合并：以 projects 为主，补充只有 runs 没有 project 记录的
  const projectNames = new Set(projects.map(p => p.name));
  const extraNames = Object.keys(runByProject).filter(n => !projectNames.has(n));

  const cards = [
    ...projects.map(p => ({
      name: p.name,
      phase: p.phase || 'intake',
      status: p.status || 'active',
      run: runByProject[p.name] || null
    })),
    ...extraNames.map(n => ({
      name: n,
      phase: runByProject[n]?.commandType || '—',
      status: runByProject[n]?.status || 'unknown',
      run: runByProject[n]
    }))
  ];

  cards.forEach(card => container.appendChild(renderProjectCard(card)));
}

function renderProjectCard({ name, phase, status, run }) {
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
  meta.textContent = phase;

  const footer = document.createElement('div');
  footer.className = 'project-card-footer';

  const time = document.createElement('span');
  time.className = 'project-card-time';
  time.textContent = run ? timeAgo(run.startedAt || run.createdAt) : '';

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:6px;';
  if (run?.logPath) {
    actions.appendChild(btn('日志', 'btn btn-sm', () => openRunDetail(run)));
  }

  footer.append(time, actions);
  div.append(header, meta, footer);

  div.addEventListener('click', e => {
    if (e.target.closest('button')) return;
    if (run) openRunDetail(run);
    else openSettingsDrawer('pipeline');
  });

  return div;
}

// ── 设置抽屉 ─────────────────────────────────────────────────────────────────

function openSettingsDrawer(panel = 'cli') {
  el('settings-drawer').hidden = false;
  switchDrawerPanel(panel);
  if (panel === 'monitor') {
    loadRuns();
    state.approvalsTimer = setInterval(loadApprovals, 3000);
  }
  if (panel === 'pipeline') loadPipeline();
  if (panel === 'memory') loadMemory();
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
  document.querySelectorAll('.drawer-panel-content').forEach(panel => {
    const match = panel.id === `panel-${name}`;
    panel.hidden = !match;
    if (!match) panel.setAttribute('hidden', '');
    else panel.removeAttribute('hidden');
  });
}

el('settings-btn').addEventListener('click', () => openSettingsDrawer('cli'));
el('settings-close').addEventListener('click', closeSettingsDrawer);
el('settings-overlay').addEventListener('click', closeSettingsDrawer);

document.querySelectorAll('.drawer-nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const panel = item.dataset.panel;
    switchDrawerPanel(panel);
    if (panel === 'monitor') { loadRuns(); state.approvalsTimer = setInterval(loadApprovals, 3000); }
    else if (state.approvalsTimer) { clearInterval(state.approvalsTimer); state.approvalsTimer = null; }
    if (panel === 'pipeline') loadPipeline();
    if (panel === 'memory') loadMemory();
    if (panel === 'costs') loadDashboard();
    if (panel === 'skills') loadSkills();
    if (panel === 'mcps') loadMcps();
  });
});

// ── 执行模式：CLI 扫描 ────────────────────────────────────────────────────────

const CLI_KNOWN = [
  { name: 'Claude Code', key: 'claude',   icon: '🤖', desc: 'Anthropic official CLI' },
  { name: 'Codex CLI',   key: 'codex',    icon: '🔷', desc: 'OpenAI official CLI' },
  { name: 'Gemini CLI',  key: 'gemini',   icon: '🔵', desc: 'Google official CLI' },
  { name: 'OpenCode',    key: 'opencode', icon: '⬜', desc: 'Open-source agent CLI' }
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
}

async function scanLocalCLI(forceRescan = false) {
  const list = el('cli-list');
  list.replaceChildren();

  const loadingItem = document.createElement('div');
  loadingItem.className = 'cli-item';
  loadingItem.innerHTML = '<span class="meta">检测中…</span>';
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
      icon.className = 'cli-icon';
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
    item.innerHTML = `<span class="meta">检测失败：${e.message}</span>`;
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
    panel.innerHTML = `<p class="meta">加载失败：${e.message}</p>`;
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

// ── 启动对话框 ────────────────────────────────────────────────────────────────

const launchState = { mode: 'project', commandType: 'go', text: '' };

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
  submitBtn.textContent = '启动';

  // 乐观渲染：先打开对话框，再异步分类
  renderIntentBadge({ mode: 'uncertain', label: '分析中…', description: '' });
  setLaunchMode('project'); // 默认项目模式，等待分类结果
  dialog.removeAttribute('hidden'); // 清除可能残留的 hidden 属性
  if (dialog.showModal) dialog.showModal();

  try {
    const result = await fetchJson('/api/intent/classify', {
      method: 'POST',
      body: JSON.stringify({ prompt: text })
    });
    renderIntentBadge(result);
    setLaunchMode(result.mode === 'simple' ? 'simple' : 'project');
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
    // 简单模式：用时间戳生成临时项目名，直接 go
    projectName = `quick-${Date.now().toString(36)}`;
    commandType = 'go';
    prompt = `快速生成任务（简单模式，无需完整流水线）：\n\n${text}\n\n请直接输出完整代码，不需要经过多阶段审批。`;
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
    div.innerHTML = `<div><div class="item-title">${item.title}</div><div class="meta">${item.meta}</div></div>`;
    div.appendChild(badge(item.status, item.status));
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
        const { gates = [] } = await fetchJson(`/api/gates/project/${encodeURIComponent(project.name)}`);
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
  inputRow.hidden = run.status !== 'running';
  state.activeRunId = run.id;
  panel.hidden = false;

  if (state.logSource) { state.logSource.close(); state.logSource = null; }

  const src = new EventSource(`/api/runs/${run.id}/stream`);
  state.logSource = src;

  src.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    renderTranscriptEvent(transcript, msg);
    transcript.scrollTop = transcript.scrollHeight;

    if (msg.kind === 'done') {
      setRunStatusBadge(statusEl, msg.status);
      inputRow.hidden = true;
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
  badgeEl.textContent = status;
  badgeEl.className = 'run-detail-status-badge ' + (status || '');
}

function renderTranscriptEvent(container, msg) {
  const block = document.createElement('div');
  block.className = 'transcript-block';

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
    const pack = await fetchJson('/api/memory/packs/latest?scopeType=company&scopeId=default');
    renderPack(pack);
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
    card.innerHTML = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;"><strong style="font-size:13px;">${ev.eventType}</strong><span class="badge">${ev.source}</span></div><div class="meta">${ev.scopeType}/${ev.scopeId} · ${timeAgo(ev.occurredAt)}</div>`;
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
  try { await fetchJson('/api/memory/compress', { method: 'POST', body: JSON.stringify({ scopeType: 'company', scopeId: 'default' }) }); }
  catch {}
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
