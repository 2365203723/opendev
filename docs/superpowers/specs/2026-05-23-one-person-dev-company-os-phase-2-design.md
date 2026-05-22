# 一人开发公司 OS Phase 2 设计规格：迭代闭环

> 日期：2026-05-23  
> 状态：已确认设计规格  
> 前置：Phase 0+1 已合并到 master（`fce7a3d`）  
> 范围：Change Request → Impact Analysis → Patch Plan → Regression → Release 闭环

## 1. 背景与目标

Phase 0+1 实现了只读索引和本地 Web Console。Phase 2 在此基础上增加交付后变更管理能力：用户提交 Change Request 后，Control Plane 自动触发 Agent 做 Impact Analysis，生成 Patch Plan 文档供用户审阅，用户确认后执行 Patch，最后跑全量 Regression 并生成 Release Note。

### 1.1 目标

1. 提供 Change Request 创建、查看、状态跟踪的 API 和 UI。
2. CR 提交后自动路由到 Architect 或 PM 做 Impact Analysis。
3. IA 完成后自动生成 Patch Plan 文档，用户审阅后点击"执行"才启动。
4. 执行时新增 `patch` 命令类型，构造专门 headless prompt 约束 Agent 只做 CR 范围内的事。
5. Regression 跑全量测试，结果落盘并展示在 GUI。
6. Release 阶段生成 Release Note，更新 `.status.json` 和 lessons。

### 1.2 非目标

1. 不实现 Memory Vault（Phase 3）。
2. 不实现 Product / Milestone / Workstream 四层工作流（Phase 4）。
3. 不实现 Tauri / Electron 封装（Phase 5）。
4. 不修改 Phase 0+1 已有的 `/api/runs`、`/api/dashboard`、`/api/projects` 语义。
5. 不实现 CR 的审批流或多人协作。

## 2. 数据模型扩展

Phase 2 在现有 SQLite schema 上新增三张表，不修改 Phase 0+1 的五张表。

### 2.1 新增 SQLite 表

```sql
CREATE TABLE IF NOT EXISTS change_requests (
  id TEXT PRIMARY KEY,
  project_name TEXT NOT NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  scope TEXT NOT NULL,
  current_behavior TEXT NOT NULL,
  expected_behavior TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  ia_run_id TEXT,
  patch_run_id TEXT,
  regression_run_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_name) REFERENCES projects(name) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cr_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cr_id TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  path TEXT NOT NULL,
  content_summary TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (cr_id) REFERENCES change_requests(id) ON DELETE CASCADE,
  UNIQUE(cr_id, doc_type)
);

CREATE TABLE IF NOT EXISTS regression_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cr_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL,
  total_tests INTEGER,
  passed_tests INTEGER,
  failed_tests INTEGER,
  report_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (cr_id) REFERENCES change_requests(id) ON DELETE CASCADE
);
```

### 2.2 字段说明

**change_requests**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | UUID，主键 |
| project_name | TEXT | 关联 projects.name |
| title | TEXT | CR 标题 |
| source | TEXT | user_input / qa_finding / online_issue / internal |
| scope | TEXT | project / workstream / milestone |
| current_behavior | TEXT | 当前行为描述 |
| expected_behavior | TEXT | 期望行为描述 |
| acceptance_criteria | TEXT | 布尔可判定的验收标准，JSON 数组字符串 |
| priority | TEXT | critical / high / medium / low |
| status | TEXT | open / ia_running / ia_done / patch_pending / patch_running / regression_running / released / cancelled |
| ia_run_id | TEXT | Impact Analysis 的 runs.id |
| patch_run_id | TEXT | Patch 执行的 runs.id |
| regression_run_id | TEXT | Regression 的 runs.id |

**cr_documents**

| doc_type | 说明 |
|----------|------|
| ia | Impact Analysis 文档路径 |
| patch_plan | Patch Plan 文档路径 |
| release_note | Release Note 路径 |

**status 状态机**

```text
open
  → ia_running（触发 IA Agent）
  → ia_done（IA 完成，等用户审阅）
  → patch_pending（用户确认执行 Patch）
  → patch_running（Patch Agent 运行中）
  → regression_running（Patch 完成，跑全量 Regression）
  → released（Regression 通过，Release Note 生成）
  → cancelled（任意阶段可取消）
```

## 3. 新增 API

所有新 API 挂载在现有 `createApp` 中，不新建服务。

### 3.1 Change Request CRUD

```
POST   /api/change-requests
GET    /api/change-requests
GET    /api/change-requests/:id
PATCH  /api/change-requests/:id/cancel
```

**POST /api/change-requests** 请求体：

```json
{
  "projectName": "demo",
  "title": "修复登录超时问题",
  "source": "user_input",
  "scope": "project",
  "currentBehavior": "登录后 30 分钟无操作会话不过期",
  "expectedBehavior": "登录后 30 分钟无操作自动登出",
  "acceptanceCriteria": ["30 分钟无操作后访问任意页面跳转登录页", "登出后 token 失效"],
  "priority": "high"
}
```

响应：创建的 CR 对象，status 为 `open`。

创建成功后，Control Plane 立即异步触发 Impact Analysis（不等待 IA 完成再响应）。

### 3.2 触发 Impact Analysis

```
POST /api/change-requests/:id/trigger-ia
```

通常由 CR 创建时自动调用，也可手动重触发（IA 失败时）。

触发逻辑：

1. 读取 CR 的 `currentBehavior`、`expectedBehavior`、`acceptanceCriteria`。
2. 判断路由：
   - 包含"架构"、"数据模型"、"API"、"安全"、"数据库"、"schema"、"接口"关键词 → Architect
   - 否则 → PM
   - 两类关键词都有 → Architect（Architect 完成后 PM 可继续）
3. 构造 `patch` 命令类型的 headless prompt（见 3.4）。
4. 调用 `runner.start({ commandType: 'patch', targetName: crId, patchPhase: 'ia', agentRole: 'architect' | 'pm', crPath })`。
5. 更新 CR status 为 `ia_running`，记录 `ia_run_id`。

### 3.3 确认执行 Patch Plan

```
POST /api/change-requests/:id/execute-patch
```

前置条件：CR status 必须为 `ia_done`。

执行逻辑：

1. 读取 `cr_documents` 中 `doc_type = 'patch_plan'` 的文档路径。
2. 构造 `patch` 命令类型 headless prompt，`patchPhase: 'execute'`。
3. 调用 runner，更新 CR status 为 `patch_running`，记录 `patch_run_id`。
4. Patch 完成后自动触发 Regression（见 3.5）。

### 3.4 patch 命令类型

扩展 `commandBuilder.js`，新增 `patch` 命令类型。

`patch` 命令不接受 `targetName`，而是接受 `crId` 和 `patchPhase`。

**IA 阶段 prompt 模板：**

```
在 {claudeAssetsDir} 中，针对项目 {projectName} 的变更请求 {crId} 执行 Impact Analysis。

变更请求文件：{crPath}

要求：
1. 分析影响的文件、接口、数据模型、测试和文档。
2. 判断是否需要修改 charter、design 或 acceptance-matrix。
3. 列出需要参与的 Agent 角色。
4. 评估回归测试范围。
5. 如需用户确认范围或预算，明确标注。
6. 将 Impact Analysis 结果写入 {iaOutputPath}。
7. 将 Patch Plan 写入 {patchPlanPath}。

遵守项目 CLAUDE.md、governance 规则。只做 Impact Analysis 和 Patch Plan，不修改任何源代码。
```

**执行阶段 prompt 模板：**

```
在 {claudeAssetsDir} 中，针对项目 {projectName} 的变更请求 {crId} 执行 Patch Plan。

Patch Plan 文件：{patchPlanPath}
Impact Analysis 文件：{iaPath}

要求：
1. 只做 Patch Plan 范围内的修改，不超出范围。
2. 每个修改必须对应 Patch Plan 中的验收标准。
3. 涉及安全、认证、支付、权限、数据迁移时必须经过 Security 和 Reviewer。
4. 需要架构变化时必须更新 doc/design.md 或追加 ADR。
5. 完成后更新 .status.json 和必要 handoff 文件。

遵守项目 CLAUDE.md、governance 规则和 Codex 双审要求。
```

### 3.5 Regression

Patch 执行完成后，Control Plane 自动触发全量 Regression：

```
POST /api/change-requests/:id/trigger-regression
```

通常由 Patch 完成事件自动调用，也可手动重触发。

执行逻辑：

1. 构造 `patch` 命令类型 headless prompt，`patchPhase: 'regression'`。
2. Regression prompt 要求 Agent 跑全量测试（`npm run test:coverage`）并将结果写入 `G:/qa-reports/{projectName}/regression-{crId}.md`。
3. 更新 CR status 为 `regression_running`，记录 `regression_run_id`。
4. Regression 完成后，Control Plane 读取报告，判断是否全部通过：
   - 通过 → 自动触发 Release Note 生成，CR status 更新为 `released`。
   - 失败 → CR status 更新为 `patch_pending`（允许用户重新执行 Patch）。

### 3.6 Release Note 生成

Regression 通过后自动执行：

1. 构造 `patch` 命令类型 headless prompt，`patchPhase: 'release'`。
2. Release prompt 要求 Agent 生成 Release Note，更新 `.status.json`，追加 lessons。
3. Release Note 路径写入 `cr_documents`，doc_type 为 `release_note`。

## 4. commandBuilder 扩展

在现有 `commandBuilder.js` 中扩展 `patch` 命令类型。

`patch` 命令的参数结构与 `go/intake/recover` 不同，需要单独处理：

```js
// 现有 COMMANDS 扩展
const COMMANDS = new Set(['intake', 'go', 'recover', 'patch']);

// patch 命令专用构造函数
function buildPatchCommand({ claudeCommand, claudeAssetsDir, projectName, crId, patchPhase, crPath, iaPath, patchPlanPath }) {
  // 按 patchPhase 选择 prompt 模板
  // 返回 { file, args, prompt }
}
```

`patchPhase` 取值：`ia`、`execute`、`regression`、`release`。

`crId` 必须通过 UUID 格式校验（`/^[0-9a-f-]{36}$/i`），不使用 SAFE_TARGET 正则。

## 5. store 扩展

在现有 `store.js` 中新增 CR 相关方法：

```js
// 新增方法
createChangeRequest(cr)
updateChangeRequest({ id, status, iaRunId, patchRunId, regressionRunId, updatedAt })
getChangeRequest(id)
listChangeRequests(projectName)
upsertCrDocument({ crId, docType, path, contentSummary })
getCrDocument(crId, docType)
createRegressionResult({ crId, runId, status, totalTests, passedTests, failedTests, reportPath })
```

## 6. runner 扩展

`claudeRunner.js` 的 `start` 方法需要支持 `patch` 命令类型。

`patch` 命令的 payload 结构：

```js
{
  commandType: 'patch',
  projectName: 'demo',
  crId: 'uuid',
  patchPhase: 'ia' | 'execute' | 'regression' | 'release',
  crPath: 'E:/projects/demo/doc/cr-{crId}.md',
  iaPath: 'E:/projects/demo/doc/ia-{crId}.md',
  patchPlanPath: 'E:/projects/demo/doc/patch-plan-{crId}.md'
}
```

runner 完成后，Control Plane 的 app 层需要监听 run 完成事件，根据 `patchPhase` 自动推进 CR 状态机。

## 7. app 层扩展

在 `app.js` 中新增 CR 相关路由，并实现 run 完成后的状态机推进逻辑。

**run 完成回调逻辑：**

```
run 完成 → 查找关联 CR
  patchPhase = 'ia' → 更新 CR status = ia_done，写 cr_documents
  patchPhase = 'execute' → 自动触发 regression
  patchPhase = 'regression' → 读取报告，判断通过/失败
    通过 → 自动触发 release
    失败 → CR status = patch_pending
  patchPhase = 'release' → CR status = released
```

由于 `claudeRunner.start` 是 Promise，run 完成时在 `.then()` 中执行状态机推进，不阻塞 API 响应。

## 8. Web Console 扩展

在现有 `src/public/` 中扩展迭代中心页面。

### 8.1 迭代中心页面

新增 `<section id="iteration-center">` 区域，包含：

1. **CR 列表**：展示所有 CR，按状态分组（open/running/released/cancelled）。
2. **创建 CR 表单**：填写 projectName、title、source、scope、currentBehavior、expectedBehavior、acceptanceCriteria（多行）、priority。
3. **CR 详情面板**：点击 CR 展开，显示 IA 文档链接、Patch Plan 文档链接、Regression 报告链接、Release Note 链接。
4. **执行按钮**：CR status 为 `ia_done` 时显示"执行 Patch"按钮；status 为 `patch_pending` 时显示"重新执行 Patch"按钮。
5. **状态徽章**：每个 CR 显示当前 status 的颜色徽章。

### 8.2 状态颜色映射

| status | 颜色 |
|--------|------|
| open | muted `#8899a6` |
| ia_running / patch_running / regression_running | primary `#1d9bf0` |
| ia_done / patch_pending | warning `#f4a261`（新增 CSS 变量） |
| released | success `#00ba7c` |
| cancelled | muted `#8899a6` |

## 9. 文件路径约定

Phase 2 新增的文档落盘路径：

| 文档 | 路径 |
|------|------|
| CR 原始文档 | `E:/projects/{projectName}/doc/cr-{crId}.md` |
| Impact Analysis | `E:/projects/{projectName}/doc/ia-{crId}.md` |
| Patch Plan | `E:/projects/{projectName}/doc/patch-plan-{crId}.md` |
| Regression 报告 | `G:/qa-reports/{projectName}/regression-{crId}.md` |
| Release Note | `E:/projects/{projectName}/doc/release-note-{crId}.md` |

所有路径在 Control Plane 中由 `config.projectsDir` 和 `config.qaReportsDir` 拼接，不硬编码。

## 10. 输入校验规则

**POST /api/change-requests 校验：**

| 字段 | 规则 |
|------|------|
| projectName | 必填，匹配 `SAFE_TARGET` 正则，长度 1-120 |
| title | 必填，字符串，长度 1-200 |
| source | 必填，枚举：user_input / qa_finding / online_issue / internal |
| scope | 必填，枚举：project / workstream / milestone |
| currentBehavior | 必填，字符串，长度 1-2000 |
| expectedBehavior | 必填，字符串，长度 1-2000 |
| acceptanceCriteria | 必填，非空字符串数组，每条长度 1-500，最多 20 条 |
| priority | 可选，枚举：critical / high / medium / low，默认 medium |

**POST /api/change-requests/:id/execute-patch 前置校验：**

- CR 必须存在。
- CR status 必须为 `ia_done` 或 `patch_pending`。
- `cr_documents` 中必须存在 `patch_plan` 文档。

## 11. 阶段落地边界

Phase 2 只实现以下内容：

1. SQLite 三张新表（change_requests / cr_documents / regression_results）。
2. store 新增 CR 相关方法。
3. commandBuilder 扩展 `patch` 命令类型和四个 patchPhase prompt 模板。
4. runner 支持 `patch` payload。
5. app 新增 CR CRUD API、trigger-ia、execute-patch、trigger-regression API。
6. app 实现 run 完成后的 CR 状态机推进。
7. Web Console 迭代中心页面。

Phase 2 不实现：

1. CR 的审批流或多人协作。
2. Patch Plan 的人工编辑（只读展示）。
3. Regression 的范围过滤（全量）。
4. Memory Vault 集成。
5. 大项目四层工作流。

## 12. 风险与约束

1. **Agent 执行质量**：IA 和 Patch 的质量取决于 headless prompt 和 Agent 能力，Control Plane 只负责触发和状态跟踪，不保证 Agent 输出质量。
2. **文件路径存在性**：runner 完成后，Control Plane 需要检查 IA/Patch Plan 文档是否实际落盘，若缺失则 CR status 标记为 `ia_running`（失败）并暴露错误。
3. **并发 CR**：同一项目可以有多个 CR，但同一时间只允许一个 `patch_running` 或 `regression_running`，Control Plane 需要在触发前检查。
4. **Regression 报告解析**：Control Plane 通过读取报告文件判断通过/失败，报告格式必须包含可机器解析的通过/失败标记（如 `PASS` / `FAIL` 行）。
5. **回滚**：Phase 2 不实现自动回滚，Regression 失败时只标记 `patch_pending`，由用户决定是否重新执行或取消 CR。

## 13. 自审记录

1. 完整性检查：全文不保留未填写项或临时标记。
2. 一致性检查：所有 API 路径、状态机、文档路径、字段名在各节中保持一致。
3. 范围检查：Phase 2 只做迭代闭环，Memory Vault 和四层工作流明确排除。
4. 歧义检查：IA 路由规则、patch 命令 payload 结构、run 完成回调逻辑均给出明确约束。
5. 与 Phase 0+1 兼容性：不修改现有五张表、不修改现有 API 语义、不修改 `go/intake/recover` 命令类型。
