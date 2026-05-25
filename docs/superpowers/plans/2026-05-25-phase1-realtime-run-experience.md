# Phase 1 实时运行体验实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 control-plane 改成 CLI 等价的实时运行体验：提交需求后立即看到 Claude Code 的实时输出（助手文本、工具调用、工具结果），日志可从首页直接打开。

**Architecture:** 把 runner 的 `--output-format json` 改成 `--output-format stream-json`，在 SSE 端点解析逐行 stream-json 事件并以类型化 SSE 转发给前端；前端在提交后立即打开运行详情面板，实时渲染 transcript。流水线面板不变（Phase 2 再做）。

**Tech Stack:** Node.js/Express/SSE（已有），better-sqlite3（已有），Vitest（已有），Headless Chrome DevTools（集成验证）

---

## 文件变更一览

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/runner/commandBuilder.js` | 修改 | 把 `--output-format json` 改成 `stream-json`，加 `--verbose` |
| `src/app.js` | 修改 | `/api/runs/:id/stream` 改成解析 stream-json 并发送类型化 SSE 事件 |
| `src/public/index.html` | 修改 | 新增 `#run-detail-panel`（首页直接嵌入，不藏抽屉），调整首页布局 |
| `src/public/app.js` | 修改 | 提交后自动打开运行详情；渲染 assistant/tool/result/error 事件 |
| `src/public/styles.css` | 修改 | 运行详情面板样式 |
| `tests/commandBuilder.test.js` | 修改 | 断言输出格式 stream-json + verbose |
| `tests/streamParsing.test.js` | 新建 | stream-json 事件解析逻辑单元测试 |
| `tests/publicFiles.test.js` | 修改 | 加 `run-detail-panel` 断言 |

---

## Task 1：commandBuilder 改为 stream-json + verbose

**Files:**
- Modify: `control-plane/src/runner/commandBuilder.js:148-186`
- Modify: `control-plane/tests/commandBuilder.test.js`

- [ ] **Step 1：先让已有的 commandBuilder 测试失败**

在 `tests/commandBuilder.test.js` 的第一个测试把旧断言加回来：

```js
it('builds a headless go command with JSON output', () => {
  const command = buildClaudeCommand({
    claudeCommand: 'claude',
    claudeAssetsDir: 'H:/claude-assets',
    commandType: 'go',
    targetName: 'demo-client'
  });
  expect(command.args).toContain('stream-json');   // 新增
  expect(command.args).toContain('--verbose');     // 新增
  // 保留旧断言
  expect(command.file).toBe('claude');
  expect(command.args).toContain('-p');
  expect(command.args).toContain('--output-format');
  expect(command.prompt).toContain('/go demo-client');
});
```

- [ ] **Step 2：运行测试确认失败**

```bash
npm --prefix "H:/claude-assets/control-plane" test -- tests/commandBuilder.test.js
```

预期：`stream-json` 和 `--verbose` 断言 FAIL（当前是 `json`，无 `--verbose`）。

- [ ] **Step 3：修改 commandBuilder 的输出参数**

在 `src/runner/commandBuilder.js` 把所有 `'--output-format', 'json'` 改成 `'--output-format', 'stream-json', '--verbose'`。共有 3 处（`patch` 分支、`memory` 分支、通用分支）：

```js
// patch 分支 (约 line 148-152)
return {
  file: claudeCommand,
  args: ['-p', prompt, '--output-format', 'stream-json', '--verbose'],
  prompt
};

// memory 分支 (约 line 156-161)
return {
  file: claudeCommand,
  args: ['-p', prompt, '--output-format', 'stream-json', '--verbose'],
  prompt
};

// --resume 分支 (约 line 173-178)
return {
  file: claudeCommand,
  args: ['-p', basePrompt, '--resume', rest.resumeSessionId, '--output-format', 'stream-json', '--verbose'],
  prompt: basePrompt,
  ...(env ? { env } : {})
};

// 通用分支 (约 line 181-186)
return {
  file: claudeCommand,
  args: ['-p', basePrompt, '--output-format', 'stream-json', '--verbose'],
  prompt: basePrompt,
  ...(env ? { env } : {})
};
```

- [ ] **Step 4：运行测试确认通过**

```bash
npm --prefix "H:/claude-assets/control-plane" test -- tests/commandBuilder.test.js
```

预期：所有 commandBuilder 测试 PASS。

- [ ] **Step 5：提交**

```bash
cd H:/claude-assets && git add control-plane/src/runner/commandBuilder.js control-plane/tests/commandBuilder.test.js && git commit -m "feat(runner): switch to stream-json + verbose output format"
```

---

## Task 2：stream-json 解析工具函数 + 单元测试

**Files:**
- Create: `control-plane/src/runner/streamParser.js`
- Create: `control-plane/tests/streamParsing.test.js`

stream-json 格式说明（Claude Code headless `--output-format stream-json --verbose` 输出）：

```jsonc
// 第一行：系统初始化
{"type":"system","subtype":"init","session_id":"abc123",...}
// 用户消息
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"..."}]}}
// 助手消息（含 thinking, text, tool_use）
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"..."},{"type":"tool_use","id":"...","name":"Bash","input":{"command":"ls"}}]}}
// 工具结果
{"type":"tool_result","tool_use_id":"...","content":[{"type":"text","text":"output"}]}
// 最终结果
{"type":"result","subtype":"success","result":"final text","session_id":"abc123","total_cost_usd":0.01,...}
```

- [ ] **Step 1：写 streamParser 测试（失败）**

新建 `control-plane/tests/streamParsing.test.js`：

```js
const { parseStreamLine, extractDisplayEvents } = require('../src/runner/streamParser');

describe('parseStreamLine', () => {
  it('parses a system init line', () => {
    const line = '{"type":"system","subtype":"init","session_id":"abc123","cwd":"/tmp"}';
    expect(parseStreamLine(line)).toEqual({ type: 'system', subtype: 'init', sessionId: 'abc123' });
  });

  it('parses an assistant text message', () => {
    const line = '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello"}]}}';
    const result = parseStreamLine(line);
    expect(result).toEqual({ type: 'assistant', texts: ['Hello'], toolUses: [] });
  });

  it('parses an assistant tool use', () => {
    const line = '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu1","name":"Bash","input":{"command":"ls"}}]}}';
    const result = parseStreamLine(line);
    expect(result.toolUses).toEqual([{ id: 'tu1', name: 'Bash', input: { command: 'ls' } }]);
  });

  it('parses a tool result', () => {
    const line = '{"type":"tool_result","tool_use_id":"tu1","content":[{"type":"text","text":"file.txt"}]}';
    expect(parseStreamLine(line)).toEqual({ type: 'tool_result', toolUseId: 'tu1', output: 'file.txt' });
  });

  it('parses a success result', () => {
    const line = '{"type":"result","subtype":"success","result":"done","session_id":"abc","total_cost_usd":0.01}';
    expect(parseStreamLine(line)).toEqual({ type: 'result', subtype: 'success', result: 'done', sessionId: 'abc', costUsd: 0.01 });
  });

  it('returns null for non-JSON lines', () => {
    expect(parseStreamLine('not json')).toBeNull();
  });

  it('returns null for empty lines', () => {
    expect(parseStreamLine('')).toBeNull();
    expect(parseStreamLine('  ')).toBeNull();
  });

  it('returns null for unknown type', () => {
    expect(parseStreamLine('{"type":"unknown"}')).toBeNull();
  });
});

describe('extractDisplayEvents', () => {
  it('extracts text events from assistant message', () => {
    const parsed = { type: 'assistant', texts: ['Hello world'], toolUses: [] };
    const events = extractDisplayEvents(parsed);
    expect(events).toEqual([{ kind: 'text', content: 'Hello world' }]);
  });

  it('extracts tool_use events', () => {
    const parsed = { type: 'assistant', texts: [], toolUses: [{ id: 'tu1', name: 'Bash', input: { command: 'ls' } }] };
    const events = extractDisplayEvents(parsed);
    expect(events).toEqual([{ kind: 'tool_use', name: 'Bash', input: 'ls' }]);
  });

  it('extracts tool_result events', () => {
    const parsed = { type: 'tool_result', toolUseId: 'tu1', output: 'file.txt' };
    const events = extractDisplayEvents(parsed);
    expect(events).toEqual([{ kind: 'tool_result', output: 'file.txt' }]);
  });

  it('extracts result event on success', () => {
    const parsed = { type: 'result', subtype: 'success', result: 'done', sessionId: 'abc', costUsd: 0.01 };
    const events = extractDisplayEvents(parsed);
    expect(events).toEqual([{ kind: 'result', status: 'success', result: 'done', sessionId: 'abc', costUsd: 0.01 }]);
  });

  it('returns empty array for system events', () => {
    const parsed = { type: 'system', subtype: 'init', sessionId: 'abc' };
    expect(extractDisplayEvents(parsed)).toEqual([]);
  });
});
```

- [ ] **Step 2：运行测试确认失败**

```bash
npm --prefix "H:/claude-assets/control-plane" test -- tests/streamParsing.test.js
```

预期：FAIL（module not found）。

- [ ] **Step 3：实现 streamParser.js**

新建 `control-plane/src/runner/streamParser.js`：

```js
function parseStreamLine(line) {
  if (!line || !line.trim()) return null;
  let msg;
  try { msg = JSON.parse(line); } catch { return null; }

  if (msg.type === 'system' && msg.subtype === 'init') {
    return { type: 'system', subtype: 'init', sessionId: msg.session_id || null };
  }

  if (msg.type === 'assistant' && msg.message?.content) {
    const texts = [];
    const toolUses = [];
    for (const block of msg.message.content) {
      if (block.type === 'text') texts.push(block.text);
      if (block.type === 'tool_use') toolUses.push({ id: block.id, name: block.name, input: block.input });
    }
    return { type: 'assistant', texts, toolUses };
  }

  if (msg.type === 'tool_result') {
    const content = msg.content || [];
    const output = content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    return { type: 'tool_result', toolUseId: msg.tool_use_id || null, output };
  }

  if (msg.type === 'result') {
    return {
      type: 'result',
      subtype: msg.subtype || 'unknown',
      result: msg.result || null,
      sessionId: msg.session_id || null,
      costUsd: msg.total_cost_usd ?? null
    };
  }

  return null;
}

function extractDisplayEvents(parsed) {
  if (!parsed) return [];

  if (parsed.type === 'assistant') {
    const events = [];
    for (const text of parsed.texts) {
      events.push({ kind: 'text', content: text });
    }
    for (const tu of parsed.toolUses) {
      const inputStr = typeof tu.input === 'object'
        ? (tu.input.command || tu.input.path || JSON.stringify(tu.input))
        : String(tu.input);
      events.push({ kind: 'tool_use', name: tu.name, input: inputStr });
    }
    return events;
  }

  if (parsed.type === 'tool_result') {
    return [{ kind: 'tool_result', output: parsed.output }];
  }

  if (parsed.type === 'result') {
    return [{
      kind: 'result',
      status: parsed.subtype,
      result: parsed.result,
      sessionId: parsed.sessionId,
      costUsd: parsed.costUsd
    }];
  }

  return [];
}

module.exports = { parseStreamLine, extractDisplayEvents };
```

- [ ] **Step 4：运行测试确认通过**

```bash
npm --prefix "H:/claude-assets/control-plane" test -- tests/streamParsing.test.js
```

预期：所有 14 个测试 PASS。

- [ ] **Step 5：提交**

```bash
cd H:/claude-assets && git add control-plane/src/runner/streamParser.js control-plane/tests/streamParsing.test.js && git commit -m "feat(runner): add stream-json parser utility"
```

---

## Task 3：更新 SSE 端点，发送类型化 stream-json 事件

**Files:**
- Modify: `control-plane/src/app.js:699-749`（`/api/runs/:id/stream` 路由）

- [ ] **Step 1：手动复现当前 SSE 输出**

```bash
# 先启动一个 run 看看 log 文件内容是 stream-json 格式了
node -e "const fs=require('fs'); const logPath='G:/logs/agents/' + require('H:/claude-assets/control-plane/src/db').openDatabase('H:/claude-assets/control-plane/data/control-plane.db') && ''; console.log('检查最新 log')"
```

实际检查：找到最新 run 的 logPath，打开文件前 5 行，确认现在已是 stream-json 格式：
```bash
node - <<'NODE'
const { openDatabase } = require('H:/claude-assets/control-plane/src/db');
const { createStore } = require('H:/claude-assets/control-plane/src/store');
const fs = require('fs');
const db = openDatabase('H:/claude-assets/control-plane/data/control-plane.db');
const store = createStore(db);
const run = store.listRuns()[0];
console.log('logPath:', run.logPath);
if (run.logPath) {
  const content = fs.readFileSync(run.logPath, 'utf8').split('\n').slice(0, 5).join('\n');
  console.log('first 5 lines:', content);
}
db.close();
NODE
```

预期：看到 `{"type":"system","subtype":"init",...}` 格式（Task 1 改完后），或旧格式（Task 1 前）。

- [ ] **Step 2：在 `app.js` 中 require streamParser**

在 `src/app.js` 顶部已有的 require 区域加一行（具体行号看当前文件头部，约 line 8-10 附近）：

```js
const { parseStreamLine, extractDisplayEvents } = require('./runner/streamParser');
```

- [ ] **Step 3：重写 SSE 端点**

找到 `app.get('/api/runs/:id/stream', ...)` 路由（约 line 700-749），把函数体替换为：

```js
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
```

- [ ] **Step 4：运行全量测试确认没有回归**

```bash
npm --prefix "H:/claude-assets/control-plane" test
```

预期：所有已有测试 + Task 1-2 新测试 PASS（约 275+14 个测试）。

- [ ] **Step 5：手动验证 SSE 端点**

找到一个 completed run，验证 SSE 能正常读到：
```bash
node - <<'NODE'
const { openDatabase } = require('H:/claude-assets/control-plane/src/db');
const { createStore } = require('H:/claude-assets/control-plane/src/store');
const db = openDatabase('H:/claude-assets/control-plane/data/control-plane.db');
const store = createStore(db);
const run = store.listRuns().find(r => r.status === 'completed' && r.logPath);
console.log('run id:', run?.id);
db.close();
NODE
# 然后：
curl -sS "http://127.0.0.1:3100/api/runs/<上面的id>/stream"
```

预期：看到 `data: {"kind":"text","content":"..."}` 等类型化事件，最后是 `data: {"kind":"done","status":"completed"}`。

- [ ] **Step 6：提交**

```bash
cd H:/claude-assets && git add control-plane/src/app.js && git commit -m "feat(api): stream-json typed SSE events for run log stream"
```

---

## Task 4：前端 HTML — 运行详情面板结构

**Files:**
- Modify: `control-plane/src/public/index.html`
- Modify: `control-plane/tests/publicFiles.test.js`

- [ ] **Step 1：更新 publicFiles 测试（先失败）**

在 `tests/publicFiles.test.js` 的第一个 it 块里加断言：

```js
expect(html).toContain('id="run-detail-panel"');
expect(html).toContain('id="run-transcript"');
expect(html).toContain('id="run-status-bar"');
```

- [ ] **Step 2：运行测试确认失败**

```bash
npm --prefix "H:/claude-assets/control-plane" test -- tests/publicFiles.test.js
```

预期：3 个新断言 FAIL。

- [ ] **Step 3：在 `index.html` 的 `<div class="home">` 之后，`<div id="settings-drawer">` 之前，加运行详情面板**

找到 `<!-- ── 设置抽屉 ── -->` 注释行之前，插入：

```html
  <!-- ── 运行详情面板 ── -->
  <div id="run-detail-panel" class="run-detail-panel" hidden>
    <div class="run-detail-header">
      <div class="run-detail-title-row">
        <span id="run-detail-title" class="run-detail-title">运行详情</span>
        <span id="run-detail-status" class="run-detail-status-badge"></span>
      </div>
      <div id="run-status-bar" class="run-status-bar">
        <span id="run-detail-target" class="meta"></span>
        <span id="run-detail-time" class="meta"></span>
        <span id="run-detail-cost" class="meta"></span>
      </div>
      <button id="run-detail-close" class="btn-ghost btn-sm">✕ 关闭</button>
    </div>
    <div id="run-transcript" class="run-transcript"></div>
    <div id="run-detail-input-row" class="run-detail-input-row" hidden>
      <input id="run-detail-input" type="text" placeholder="追加指令…" class="field-input">
      <button id="run-detail-send" class="btn btn-primary btn-sm">发送</button>
    </div>
  </div>
```

- [ ] **Step 4：运行测试确认通过**

```bash
npm --prefix "H:/claude-assets/control-plane" test -- tests/publicFiles.test.js
```

预期：所有 publicFiles 测试 PASS。

- [ ] **Step 5：提交**

```bash
cd H:/claude-assets && git add control-plane/src/public/index.html control-plane/tests/publicFiles.test.js && git commit -m "feat(html): add run detail panel markup"
```

---

## Task 5：CSS — 运行详情面板样式

**Files:**
- Modify: `control-plane/src/public/styles.css`

- [ ] **Step 1：在 `styles.css` 末尾追加以下样式**

先读取 styles.css 末尾确认现有 CSS 变量（`--primary`, `--bg`, `--surface`, `--border`, `--text`, `--text-subtle`，`--success`, `color-scheme: dark` 等），然后追加：

```css
/* ── 运行详情面板 ─────────────────────────────────────────────────────────── */

.run-detail-panel {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.run-detail-header {
  padding: 14px 20px 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex-shrink: 0;
}

.run-detail-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.run-detail-title {
  font-weight: 600;
  font-size: 14px;
}

.run-detail-status-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 20px;
  background: var(--border);
  color: var(--text-subtle);
}
.run-detail-status-badge.running { background: var(--primary); color: #fff; }
.run-detail-status-badge.completed { background: var(--success, #16a34a); color: #fff; }
.run-detail-status-badge.failed { background: #dc2626; color: #fff; }

.run-status-bar {
  display: flex;
  gap: 16px;
  align-items: center;
  flex: 1;
  flex-wrap: wrap;
}

.run-transcript {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  font-family: 'Consolas', 'Menlo', monospace;
  font-size: 13px;
  line-height: 1.6;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.transcript-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.transcript-text {
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text);
}

.transcript-tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--primary);
  font-size: 12px;
  font-weight: 600;
}

.transcript-tool-icon {
  font-size: 11px;
  background: var(--primary);
  color: #fff;
  padding: 1px 6px;
  border-radius: 4px;
}

.transcript-tool-input {
  color: var(--text-subtle);
  font-size: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 10px;
  white-space: pre-wrap;
  word-break: break-word;
}

.transcript-tool-result {
  color: var(--text);
  font-size: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--success, #16a34a);
  border-radius: 4px;
  padding: 6px 10px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

.transcript-result-block {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px 16px;
  color: var(--text-subtle);
  font-size: 12px;
}
.transcript-result-block.success { border-color: var(--success, #16a34a); color: var(--success, #16a34a); }
.transcript-result-block.failed { border-color: #dc2626; color: #dc2626; }

.transcript-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid var(--primary);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  vertical-align: middle;
}

.run-detail-input-row {
  padding: 10px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
```

- [ ] **Step 2：运行全量测试（CSS 无单元测试，只做整体回归）**

```bash
npm --prefix "H:/claude-assets/control-plane" test
```

预期：所有测试 PASS。

- [ ] **Step 3：提交**

```bash
cd H:/claude-assets && git add control-plane/src/public/styles.css && git commit -m "feat(css): run detail panel styles"
```

---

## Task 6：前端 JS — 运行详情面板交互逻辑

**Files:**
- Modify: `control-plane/src/public/app.js`

运行详情面板替代原来藏在抽屉里的日志流，用户提交后自动打开。

- [ ] **Step 1：在 `app.js` 中找到 `openLogStream` 函数（约 line 919-948）**

用全文替换，把 `openLogStream` 整个替换为下面的实现，同时更新两处调用它的地方（`renderRunRow` 里的"日志"按钮和 `home.js` 里卡片点击）：

```js
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

function setRunStatusBadge(el, status) {
  el.textContent = status;
  el.className = 'run-detail-status-badge ' + (status || '');
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

  if (msg.kind === 'done') {
    return; // done 只更新 header，不在 transcript 里渲染
  }
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
```

- [ ] **Step 2：删除旧的 `openLogStream` 及关联事件监听器**

在 `app.js` 中找到旧的 `openLogStream` 函数（约 line 919-947）和 `el('log-stream-close').addEventListener(...)`, `el('log-stream-send').addEventListener(...)`, `el('log-stream-input').addEventListener(...)` 并全部删除。

- [ ] **Step 3：把 `renderRunRow` 里的 `openLogStream` 改成 `openRunDetail`**

找到 `renderRunRow` 函数里的：
```js
actions.appendChild(btn('日志', 'btn btn-sm', () => openLogStream(run)));
```
改为：
```js
actions.appendChild(btn('日志', 'btn btn-sm', () => openRunDetail(run)));
```

- [ ] **Step 4：把 `renderProjectCard` 里的点击改为打开运行详情**

找到 `renderProjectCard` 里：
```js
div.addEventListener('click', e => {
  if (e.target.closest('button')) return;
  openSettingsDrawer('pipeline');
});
```
改为：
```js
div.addEventListener('click', e => {
  if (e.target.closest('button')) return;
  if (card.run) openRunDetail(card.run);
  else openSettingsDrawer('pipeline');
});
```

- [ ] **Step 5：在 `launch-form` submit 后立即打开运行详情**

找到 `el('launch-form').addEventListener('submit', ...)` 里的成功回调部分（约 launch dialog close 之后）：

```js
    const ld = el('launch-dialog');
    ld.close?.();
    el('main-input').value = '';
    setStatusDot('ok');
    showToast(`已启动 ${mode === 'simple' ? '简单生成' : `/${commandType}`} · ${projectName}`, 'success');
    await loadHomePage();
```

在 `showToast(...)` 之后、`loadHomePage()` 之前，加：

```js
    // 立即打开运行详情面板（轮询等待 run 被写入 DB）
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
```

- [ ] **Step 6：在 state 对象加 `lastSessionId`**

找到文件顶部 `const state = { ... };` 加一个字段：
```js
const state = {
  activeDrawerPanel: 'cli',
  activeMemoryTab: 'facts',
  logSource: null,
  approvalsTimer: null,
  selectedType: 'go',
  activeRunId: null,
  lastSessionId: null    // 新增
};
```

- [ ] **Step 7：运行全量测试**

```bash
npm --prefix "H:/claude-assets/control-plane" test
```

预期：所有测试 PASS。

- [ ] **Step 8：提交**

```bash
cd H:/claude-assets && git add control-plane/src/public/app.js && git commit -m "feat(ui): run detail panel with typed transcript events"
```

---

## Task 7：端到端浏览器验证

**Files:** 无

- [ ] **Step 1：重启 3100 服务**

```bash
# 停止当前 3100 进程（见当前 PID）
powershell -NoProfile -Command 'Stop-Process -Id (Get-NetTCPConnection -LocalPort 3100 -State Listen).OwningProcess -Force'
# 重启
npm --prefix "H:/claude-assets/control-plane" start &
```

- [ ] **Step 2：跑 Headless Chrome 端到端验证**

```bash
node - <<'NODE'
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-e2e-'));
const port = 9240;
const child = spawn(chrome, [
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
  `--user-data-dir=${userDataDir}`,`--remote-debugging-port=${port}`,'about:blank'
], { stdio: ['ignore','pipe','pipe'] });
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
async function fetchJ(url, opts) { const r = await fetch(url, opts); if (!r.ok) throw new Error(`${r.status}`); return r.json(); }
async function waitEp() { const dl = Date.now()+10000; while (Date.now()<dl) { try { return await fetchJ(`http://127.0.0.1:${port}/json/version`); } catch { await wait(100); } } throw new Error('no chrome'); }
function connect(url) { return new Promise((res,rej) => { const ws=new WebSocket(url); ws.addEventListener('open',()=>res(ws),{once:true}); ws.addEventListener('error',rej,{once:true}); }); }
async function main() {
  await waitEp();
  const tgt = await fetchJ(`http://127.0.0.1:${port}/json/new?http://127.0.0.1:3100/`,{method:'PUT'});
  const ws = await connect(tgt.webSocketDebuggerUrl);
  let id=0; const pending=new Map(); const events=[];
  ws.addEventListener('message', m => { const d=JSON.parse(m.data); if(d.id&&pending.has(d.id)){pending.get(d.id)(d);pending.delete(d.id);}else events.push(d); });
  const send = (method, params={}) => { const mid=++id; ws.send(JSON.stringify({id:mid,method,params})); return new Promise(r=>pending.set(mid,r)); };
  await send('Runtime.enable');
  await wait(3000);
  const result = await send('Runtime.evaluate', {
    expression: `(() => new Promise(resolve => {
      const input = document.getElementById('main-input');
      input.value = '写一个返回 hello world 字符串的函数';
      input.dispatchEvent(new Event('input',{bubbles:true}));
      document.getElementById('main-submit').click();
      setTimeout(() => {
        document.querySelector('[data-mode="simple"]')?.click();
        setTimeout(() => {
          document.getElementById('launch-submit-btn').click();
          setTimeout(() => {
            const panel = document.getElementById('run-detail-panel');
            const transcript = document.getElementById('run-transcript');
            resolve({
              panelVisible: panel && !panel.hidden,
              transcriptHasContent: transcript && transcript.childElementCount > 0,
              transcriptText: transcript ? transcript.innerText.slice(0,200) : '',
              consoleErrors: 0
            });
          }, 4000);
        }, 1500);
      }, 1800);
    }))()`,
    awaitPromise: true,
    returnByValue: true
  });
  const consoleErrors = events.filter(e => e.method === 'Runtime.exceptionThrown').length;
  const val = result.result?.result?.value || {};
  console.log(JSON.stringify({ ...val, consoleErrors }, null, 2));
  ws.close();
}
main().catch(e => { console.error(e.message); process.exitCode=1; })
  .finally(async () => { child.kill(); await wait(300); fs.rmSync(userDataDir,{recursive:true,force:true}); });
NODE
```

预期结果：
```json
{
  "panelVisible": true,
  "transcriptHasContent": true,
  "transcriptText": "...Claude 的输出文字...",
  "consoleErrors": 0
}
```

- [ ] **Step 3：如果 `panelVisible` 为 false**

说明 `waitForRun` 还没拿到 run，调长等待时间后重试（把 250ms × 20 改成 500ms × 30），或直接检查 `/api/runs` 响应。

- [ ] **Step 4：确认日志按钮从监控面板可用**

用 Headless Chrome 打开监控面板，点日志按钮，检查 `run-detail-panel` 展示：
```js
openSettingsDrawer('monitor');
loadRuns();
// 等 1s
document.querySelector('.run-row button.btn').click();
// 等 0.5s
document.getElementById('run-detail-panel').hidden === false
```

- [ ] **Step 5：运行全量测试最终确认**

```bash
npm --prefix "H:/claude-assets/control-plane" test
```

预期：所有测试 PASS，无失败。

- [ ] **Step 6：最终提交**

```bash
cd H:/claude-assets && git add -A && git commit -m "feat: Phase 1 realtime run experience complete - stream-json + run detail panel"
```

---

## 自我检查

**Spec 覆盖：**
- ✅ 输入需求提交后自动打开运行详情面板 → Task 6 Step 5
- ✅ 实时显示 assistant 文本、工具调用、工具结果 → Task 6 Step 1
- ✅ 日志可从首页和监控面板两处打开 → Task 6 Step 3-4
- ✅ 运行完成后状态更新 → Task 6 Step 1（`kind: done` 处理）
- ✅ 旧 SSE 升级为类型化事件 → Task 3
- ✅ commandBuilder 改为 stream-json → Task 1
- ✅ 所有测试通过 → Task 7 Step 5

**类型一致性检查：**
- `openRunDetail(run)` — 在 Task 6 定义，在 renderRunRow（Step 3）、renderProjectCard（Step 4）、launch-form（Step 5）调用
- `renderTranscriptEvent(container, msg)` — msg.kind 枚举值：`text`, `tool_use`, `tool_result`, `result`, `done` — 与 Task 2 streamParser 的 `extractDisplayEvents` 输出一致
- `setRunStatusBadge(el, status)` — status 枚举：`running`, `completed`, `failed` — 与 store.finishRun 的 status 字段一致
- `state.lastSessionId` — 在 state 对象（Step 6）和 `openRunDetail` onmessage（Step 1）都使用

**Placeholder 扫描：** 无 TBD / TODO / 模糊步骤。
