# Phase 4 实施计划：大项目四层结构

> 日期：2026-05-22  
> **状态：已完成（2026-05-23）**  
> 前置：Phase 3 已完成  
> 目标：支持 Product / Milestone / Workstream / Task 四层结构 + 分层 Gate + 并行工作流

## 1. 总体目标

Phase 4 让系统支持大项目的多层结构和并行工作流：

1. **四层数据模型**：Product → Milestone → Workstream → Task
2. **分层 Gate**：project / milestone / workstream 三个 scope
3. **并发控制**：同一 workstream 内任务串行，不同 workstream 可并行
4. **Web Console 产品树视图**：左侧导航 + 右侧内容区

## 2. 设计决策

### 2.1 与现有 projects 表的关系（选项 C：映射）

**保留 `projects` 表**，新增 `workstreams.project_name` 外键：

```
projects 表（保留）
  ↓ 继续索引 E:\projects\<name>\.status.json

workstreams 表（新增）
  ↓ workstreams.project_name → projects.name（可选外键）
  ↓ 一个 project 可以被多个 workstream 引用
```

**兼容性规则：**
- 现有单项目流程不变，继续用 `/go <项目名>` 工作
- 需要多 workstream 时，创建 Product + Milestone + Workstream 记录，并关联 `project_name`
- 同一个 `E:\projects\foo\` 可以同时出现在 `projects` 表和 `workstreams` 表中

**状态同步规则：**
- `projects.status` 是文件系统真相源（从 `.status.json` 索引）
- `workstreams.status` 是控制面状态（手动或 runner 更新）
- 当 workstream 关联了 project 时，优先展示 `workstreams.status`

### 2.2 分层 Gate 表结构（选项 A：迁移）

**统一成 `scope_type/scope_id` 结构**，迁移现有 Gate 数据：

```sql
-- 旧表结构（Phase 0+1）
gates(
  project_name TEXT,
  name TEXT,
  status TEXT,
  evidence_path TEXT,
  checked_at INTEGER,
  PRIMARY KEY (project_name, name)
)

-- 新表结构（Phase 4）
gates(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_type TEXT NOT NULL,  -- 'product' | 'milestone' | 'workstream' | 'task' | 'project'
  scope_id TEXT NOT NULL,
  gate_name TEXT NOT NULL,
  status TEXT NOT NULL,
  evidence_path TEXT,
  checked_at INTEGER,
  UNIQUE(scope_type, scope_id, gate_name)
)
```

**迁移脚本：**
```sql
-- 1. 重命名现有表
ALTER TABLE gates RENAME TO gates_old;

-- 2. 创建新表（见上）

-- 3. 迁移数据
INSERT INTO gates (scope_type, scope_id, gate_name, status, evidence_path, checked_at)
SELECT 'project', project_name, name, status, evidence_path, checked_at
FROM gates_old;

-- 4. 验证迁移
SELECT COUNT(*) FROM gates WHERE scope_type = 'project';
SELECT COUNT(*) FROM gates_old;
-- 两者应相等

-- 5. 删除旧表
DROP TABLE gates_old;
```

### 2.3 Web Console 布局（选项 B：左右布局）

**重构成左侧导航 + 右侧内容区：**

```
┌──────────┬──────────────────────────┐
│ 左侧导航 │ 右侧内容区               │
│          │                          │
│ 公司看板 │ （根据左侧选择动态加载） │
│ 产品树   │                          │
│ ├ Prod A │                          │
│ │ ├ M1   │                          │
│ │ │ ├ 认证│                          │
│ │ │ └ 订单│                          │
│ │ └ M2   │                          │
│ └ Prod B │                          │
│ 迭代中心 │                          │
│ 记忆中心 │                          │
│ 设置     │                          │
└──────────┴──────────────────────────┘
```

**导航项：**
- 公司看板：活跃项目、阻塞项目、Gate 状态
- 产品树：Product → Milestone → Workstream → Task 树形展开
- 迭代中心：Change Request 列表
- 记忆中心：Raw Events / Episodes / Facts
- 设置：路径配置、模型策略

## 3. 实施任务

### Task 1：扩展 SQLite schema（四层表 + 迁移 gates）

**文件：** `control-plane/src/db.js`

**新增表：**

```sql
-- Product 表
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client_name TEXT,
  root_path TEXT,
  status TEXT NOT NULL DEFAULT 'idea',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Milestone 表
CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  gate_scope TEXT,
  target_date TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Workstream 表
CREATE TABLE IF NOT EXISTS workstreams (
  id TEXT PRIMARY KEY,
  milestone_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  owner_role TEXT,
  project_name TEXT,  -- 外键关联 projects.name（可选）
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE CASCADE,
  FOREIGN KEY (project_name) REFERENCES projects(name) ON DELETE SET NULL
);

-- Task 表
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  workstream_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'backlog',
  agent_role TEXT,
  priority TEXT,
  acceptance_ref TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workstream_id) REFERENCES workstreams(id) ON DELETE CASCADE
);
```

**迁移 gates 表：**

```sql
-- 1. 检查是否需要迁移
SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='gates_old';

-- 2. 如果 gates_old 不存在，执行迁移
ALTER TABLE gates RENAME TO gates_old;

CREATE TABLE IF NOT EXISTS gates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  gate_name TEXT NOT NULL,
  status TEXT NOT NULL,
  evidence_path TEXT,
  checked_at INTEGER,
  UNIQUE(scope_type, scope_id, gate_name)
);

INSERT INTO gates (scope_type, scope_id, gate_name, status, evidence_path, checked_at)
SELECT 'project', project_name, name, status, evidence_path, checked_at
FROM gates_old;

-- 3. 验证迁移
-- 迁移后的记录数应等于旧表记录数

-- 4. 删除旧表
DROP TABLE gates_old;
```

**扩展 runs 和 artifacts 表：**

```sql
-- runs 表已有 scope_type/scope_id，无需改动

-- artifacts 表已有 scope_type/scope_id，无需改动
```

**验收标准：**
- [ ] `npm test` 通过
- [ ] 迁移脚本在空库和已有数据库上都能正确执行
- [ ] 迁移后 `gates` 表记录数 = 迁移前 `gates_old` 表记录数
- [ ] 外键约束生效（删除 product 时级联删除 milestone/workstream/task）

---

### Task 2：实现四层 CRUD store 方法

**文件：** `control-plane/src/hierarchyStore.js`（新建）

**方法列表：**

```javascript
// Product
createProduct({ name, clientName, rootPath, status })
getProduct(id)
listProducts({ status })
updateProduct(id, { name, clientName, rootPath, status })
deleteProduct(id)

// Milestone
createMilestone({ productId, name, status, gateScope, targetDate })
getMilestone(id)
listMilestones({ productId, status })
updateMilestone(id, { name, status, gateScope, targetDate })
deleteMilestone(id)

// Workstream
createWorkstream({ milestoneId, name, status, ownerRole, projectName })
getWorkstream(id)
listWorkstreams({ milestoneId, status, projectName })
updateWorkstream(id, { name, status, ownerRole, projectName })
deleteWorkstream(id)

// Task
createTask({ workstreamId, title, status, agentRole, priority, acceptanceRef })
getTask(id)
listTasks({ workstreamId, status, agentRole })
updateTask(id, { title, status, agentRole, priority, acceptanceRef })
deleteTask(id)

// 树形查询
getProductTree(productId)  // 返回 Product + Milestones + Workstreams + Tasks 完整树
```

**状态约束检查：**

```javascript
// 子级存在 blocked 时，父级不得进入 released/closed
function canTransitionToReleased(milestoneId) {
  const workstreams = listWorkstreams({ milestoneId });
  return !workstreams.some(w => w.status === 'blocked');
}
```

**验收标准：**
- [ ] 所有 CRUD 方法有单元测试
- [ ] `getProductTree` 返回完整四层结构
- [ ] 状态约束检查生效（blocked 子级阻止父级 released）
- [ ] 外键级联删除正确（删除 product 时清理所有子记录）

---

### Task 3：扩展 gateStore 支持分层 scope

**文件：** `control-plane/src/gateStore.js`

**修改方法签名：**

```javascript
// 旧签名（Phase 0+1）
recordGate(projectName, name, status, evidencePath)
getGates(projectName)

// 新签名（Phase 4）
recordGate(scopeType, scopeId, gateName, status, evidencePath)
getGates(scopeType, scopeId)
listGatesByScopeType(scopeType)  // 新增：查询所有 milestone-scope gate
```

**兼容层（可选）：**

```javascript
// 为现有代码提供兼容方法
recordProjectGate(projectName, name, status, evidencePath) {
  return recordGate('project', projectName, name, status, evidencePath);
}

getProjectGates(projectName) {
  return getGates('project', projectName);
}
```

**验收标准：**
- [ ] 迁移后的 project-scope gate 可以正常查询
- [ ] 新增 milestone/workstream-scope gate 可以正常记录和查询
- [ ] `listGatesByScopeType('milestone')` 返回所有 milestone gate

---

### Task 4：实现四层 API 路由

**文件：** `control-plane/src/hierarchyApi.js`（新建）

**路由列表：**

```javascript
// Product
POST   /api/products
GET    /api/products
GET    /api/products/:id
PATCH  /api/products/:id
DELETE /api/products/:id

// Milestone
POST   /api/products/:productId/milestones
GET    /api/products/:productId/milestones
GET    /api/milestones/:id
PATCH  /api/milestones/:id
DELETE /api/milestones/:id

// Workstream
POST   /api/milestones/:milestoneId/workstreams
GET    /api/milestones/:milestoneId/workstreams
GET    /api/workstreams/:id
PATCH  /api/workstreams/:id
DELETE /api/workstreams/:id

// Task
POST   /api/workstreams/:workstreamId/tasks
GET    /api/workstreams/:workstreamId/tasks
GET    /api/tasks/:id
PATCH  /api/tasks/:id
DELETE /api/tasks/:id

// 树形查询
GET    /api/products/:id/tree
```

**分层 Gate API：**

```javascript
POST   /api/gates
  body: { scopeType, scopeId, gateName, status, evidencePath }

GET    /api/gates?scopeType=milestone&scopeId=m1
```

**验收标准：**
- [ ] 所有 API 有集成测试
- [ ] `GET /api/products/:id/tree` 返回完整四层结构
- [ ] 状态约束在 API 层生效（PATCH milestone 到 released 时检查子级 blocked）
- [ ] 分层 Gate API 可以记录和查询 milestone/workstream-scope gate

---

### Task 5：扩展 commandBuilder 支持四层 scope

**文件：** `control-plane/src/commandBuilder.js`

**新增方法：**

```javascript
buildProductCommand(productId, action)
buildMilestoneCommand(milestoneId, action)
buildWorkstreamCommand(workstreamId, action)
buildTaskCommand(taskId, action)
```

**示例：**

```javascript
buildWorkstreamCommand('ws-auth-001', 'start')
// 返回：
{
  command: '/go',
  args: ['auth-system'],
  cwd: 'E:\\projects\\auth-system',
  env: {
    PAPERCLIP_WORKSTREAM_ID: 'ws-auth-001',
    PAPERCLIP_SCOPE_TYPE: 'workstream',
    PAPERCLIP_SCOPE_ID: 'ws-auth-001'
  }
}
```

**验收标准：**
- [ ] 四层 scope 的 command 都能正确构造
- [ ] 环境变量包含 `PAPERCLIP_SCOPE_TYPE` 和 `PAPERCLIP_SCOPE_ID`
- [ ] workstream 关联了 `project_name` 时，`cwd` 指向正确的项目路径

---

### Task 6：实现并发控制（同 workstream 串行，不同 workstream 并行）

**文件：** `control-plane/src/concurrencyControl.js`（新建）

**核心逻辑：**

```javascript
class ConcurrencyControl {
  constructor() {
    this.runningWorkstreams = new Set();  // 正在运行的 workstream ID
    this.runningProjects = new Set();     // 正在运行的 project name
  }

  canStartWorkstream(workstreamId, projectName) {
    // 规则 1：同一 workstream 不能并发
    if (this.runningWorkstreams.has(workstreamId)) {
      return { allowed: false, reason: 'workstream_already_running' };
    }

    // 规则 2：同一 project 不能并发（如果 workstream 关联了 project）
    if (projectName && this.runningProjects.has(projectName)) {
      return { allowed: false, reason: 'project_already_running' };
    }

    return { allowed: true };
  }

  startWorkstream(workstreamId, projectName) {
    this.runningWorkstreams.add(workstreamId);
    if (projectName) {
      this.runningProjects.add(projectName);
    }
  }

  finishWorkstream(workstreamId, projectName) {
    this.runningWorkstreams.delete(workstreamId);
    if (projectName) {
      this.runningProjects.delete(projectName);
    }
  }
}
```

**集成到 runner：**

```javascript
// control-plane/src/runner.js
async function executeWorkstream(workstreamId) {
  const ws = hierarchyStore.getWorkstream(workstreamId);
  const check = concurrencyControl.canStartWorkstream(workstreamId, ws.projectName);
  
  if (!check.allowed) {
    return { status: 'rejected', reason: check.reason };
  }

  concurrencyControl.startWorkstream(workstreamId, ws.projectName);
  
  try {
    // 执行 runner
    const result = await runClaudeCode(/* ... */);
    return result;
  } finally {
    concurrencyControl.finishWorkstream(workstreamId, ws.projectName);
  }
}
```

**验收标准：**
- [ ] 同一 workstream 不能并发运行
- [ ] 同一 project 不能被多个 workstream 同时运行
- [ ] 不同 workstream（不同 project）可以并行运行
- [ ] runner 异常退出时，并发锁正确释放

---

### Task 7：重构 Web Console 成左右布局

**文件：** `dashboard/index.html`、`dashboard/app.js`、`dashboard/styles.css`

**新布局结构：**

```html
<div id="app">
  <nav id="sidebar">
    <ul>
      <li data-view="dashboard">公司看板</li>
      <li data-view="product-tree">产品树</li>
      <li data-view="iterations">迭代中心</li>
      <li data-view="memory">记忆中心</li>
      <li data-view="settings">设置</li>
    </ul>
  </nav>
  <main id="content">
    <!-- 动态加载内容 -->
  </main>
</div>
```

**CSS 布局：**

```css
#app {
  display: flex;
  height: 100vh;
}

#sidebar {
  width: 250px;
  background: #f5f5f5;
  border-right: 1px solid #ddd;
  overflow-y: auto;
}

#content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}
```

**产品树视图：**

```javascript
async function renderProductTree() {
  const products = await fetch('/api/products').then(r => r.json());
  
  const html = products.map(p => `
    <div class="product">
      <h3>${p.name} <span class="status">${p.status}</span></h3>
      <div class="milestones">
        ${renderMilestones(p.id)}
      </div>
    </div>
  `).join('');
  
  document.getElementById('content').innerHTML = html;
}

async function renderMilestones(productId) {
  const milestones = await fetch(`/api/products/${productId}/milestones`).then(r => r.json());
  
  return milestones.map(m => `
    <div class="milestone">
      <h4>${m.name} <span class="status">${m.status}</span></h4>
      <div class="workstreams">
        ${renderWorkstreams(m.id)}
      </div>
    </div>
  `).join('');
}

// 类似递归渲染 workstreams 和 tasks
```

**验收标准：**
- [ ] 左侧导航可以切换视图
- [ ] 产品树可以展开/折叠
- [ ] 点击 workstream 时，右侧展示详情（状态、任务列表、Gate 状态）
- [ ] 响应式布局（窗口缩小时左侧导航可折叠）

---

### Task 8：集成测试与文档

**集成测试场景：**

1. 创建 Product → Milestone → Workstream → Task 完整链路
2. 启动两个不同 workstream 的 runner，验证并行执行
3. 启动同一 workstream 的两个 runner，验证第二个被拒绝
4. 记录 milestone-scope gate，验证查询正确
5. 删除 product，验证级联删除所有子记录

**文档更新：**

- `docs/superpowers/specs/2026-05-22-one-person-dev-company-os-design.md`：标记 Phase 4 已完成
- `control-plane/README.md`：新增四层 API 文档
- `dashboard/README.md`：新增产品树视图使用说明

**验收标准：**
- [ ] 所有集成测试通过
- [ ] API 文档完整（包含请求/响应示例）
- [ ] 用户可以通过文档理解如何创建和管理四层结构

---

## 4. 验收标准（Phase 4 整体）

- [x] SQLite schema 包含 products/milestones/workstreams/tasks 四张表
- [x] gates 表已迁移成 scope_type/scope_id 结构
- [x] 四层 CRUD API 全部实现并有测试
- [x] 并发控制生效（同 workstream 串行，不同 workstream 并行）
- [x] Web Console 重构成左右布局
- [x] 产品树视图可以展示完整四层结构
- [x] 分层 Gate 可以记录和查询
- [x] 现有单项目流程不受影响（兼容性测试通过）
- [x] 所有测试通过（单元测试 + 集成测试）
- [x] 文档更新完整

---

## 5. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| gates 表迁移失败 | 丢失历史 Gate 数据 | 迁移前备份数据库；迁移后验证记录数 |
| 并发控制 bug | 同一 project 被多个 runner 同时写入 | 单元测试覆盖所有并发场景；runner 异常时释放锁 |
| Web Console 重构破坏现有功能 | 用户无法访问迭代中心/记忆中心 | 渐进式重构；保留现有功能入口 |
| 四层结构概念复杂 | 用户不理解如何使用 | 提供示例和文档；保留单项目流程作为简化入口 |

---

## 6. 后续优化（Phase 4+）

Phase 4 完成后，可以考虑以下优化：

1. **自动拆分**：intake 阶段自动识别大项目，建议拆分成多 workstream
2. **依赖管理**：Task 之间的依赖关系（Task A 完成后才能启动 Task B）
3. **资源估算**：每个 Task 预估工时和成本
4. **甘特图**：可视化 Milestone 和 Workstream 的时间线
5. **批量操作**：批量创建 Task、批量更新状态

这些优化不在 Phase 4 范围内，可以作为 Phase 4.1、4.2 逐步迭代。
