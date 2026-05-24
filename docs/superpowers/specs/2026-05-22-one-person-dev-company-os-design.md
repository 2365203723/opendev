# 一人开发公司 OS 架构升级设计规格

> 日期：2026-05-22  
> 状态：已确认设计规格  
> 范围：本地控制平面 + Web GUI + SQLite + Claude Code headless 执行引擎  
> 原则：文件系统仍然是交付真相源，GUI 只做控制面和索引层

## 1. 背景与目标

当前 `web-outsource` 流水线已经具备 `/intake`、`/go`、多 Agent、`.status.json`、handoff、quality gates、Codex 双审和 lessons 经验库等核心机制。下一阶段目标不是替换现有文件流，而是在其上增加本地控制平面，使一人可以像经营一家小型软件公司一样管理多个客户、项目、迭代、Agent 运行和长期记忆。

本规格确认采用方案 B：**本地控制平面 + Web GUI + SQLite + Claude Code headless 执行引擎**。

### 1.1 目标

1. 用 Web Console 提供公司级看板、项目详情、迭代中心、Agent 运行中心、记忆浏览器和设置页。
2. 用 Control Plane 编排现有 `/intake`、`/go`、变更请求、Gate 检查和 Agent 运行。
3. 用 SQLite 建立可查询索引，但不把 SQLite 变成产物真相源。
4. 用文件系统继续保存项目交付物、状态文件、handoff、QA 报告、日志和 lessons。
5. 用 Memory Vault 支持长期记忆、会话接力和跨项目经验复用。
6. 支持大项目的多层结构、并行工作流和分层 Gate。
7. 支持交付后的二次迭代与变更请求闭环，避免直接重新 `/go` 覆盖上下文。

### 1.2 非目标

1. 不把系统改造成云端 SaaS。
2. 不替换 Claude Code、Agent tool、Codex 双审或现有质量门制度。
3. 不把 GUI 作为唯一入口；命令行和文件系统仍可独立工作。
4. 不在第一阶段引入多人协作、权限体系、支付、租户隔离或公网访问。
5. 不在 MVP 中实现完整 Tauri / Electron 封装；第一阶段先做本地 Web。

## 2. 总体架构

系统由六层组成：

```text
Web Console
  ↓ HTTP / WebSocket
Control Plane
  ↓ process / queue / file watcher
Claude Code Runner
  ↓ read / write / execute
File System 产物层
  ↑ indexer
SQLite 索引
  ↕ retrieval / compaction
Memory Vault
```

### 2.1 Web Console

Web Console 是本地浏览器界面，只负责展示、操作入口和运行反馈。

核心页面：

1. 公司看板：展示活跃项目数、阻塞项目数、Gate 状态、近期运行和下一步责任人。
2. 项目详情：展示项目结构、产物文件、状态流转、验收标准、handoff 和 QA 报告。
3. 迭代中心：管理 Change Request、Impact Analysis、Patch Plan、Regression 和 Release。
4. Agent 运行中心：查看 Agent 队列、运行日志、失败原因、重试入口和 Codex 审查结果。
5. 记忆浏览器：查看 Raw Events、Episodes、Facts、Memory Tree 和 Retrieval Pack。
6. 设置页：管理路径、Claude Code headless 命令、模型策略、Codex 可用性检查和本地存储配置。

Web Console 不直接修改项目源文件；所有写操作必须通过 Control Plane 执行。

### 2.2 Control Plane

Control Plane 是本地后端服务，是系统的调度中心和状态协调者。

职责：

1. 扫描 `E:\projects\*\.status.json`、`doc\handoff\`、`G:\qa-reports\`、`G:\logs\agents\` 等文件。
2. 将文件系统状态同步进 SQLite 索引。
3. 接收 Web Console 操作请求，例如启动 intake、启动 go、创建变更请求、重跑失败 Agent、打开项目目录。
4. 调用 Claude Code headless 执行具体流程。
5. 维护本地运行队列，避免同一项目多个互斥流程并发写入。
6. 记录 Raw Events，供 Memory Vault 后续压缩和检索。
7. 对质量门、handoff 完整性、Codex 双审产物存在性做机器可判定检查。

Control Plane 不应重写现有 Agent 职责。它只负责调度、索引、校验和展示所需数据聚合。

### 2.3 Claude Code Runner

Claude Code Runner 是对 Claude Code headless 执行的封装层。

职责：

1. 按项目和任务构造 headless prompt。
2. 启动 `/intake <客户名>`、`/go <项目名>`、`/recover <项目名>`、变更请求流程或专项 Agent 运行。
3. 捕获 stdout、stderr、退出码、开始时间、结束时间和运行产物路径。
4. 将运行状态写回 Control Plane 的运行表和 Raw Events。
5. 遇到 blocked、Codex unavailable、reopenCount >= 3 等情况时停止自动推进，并暴露给 GUI。

Runner 不直接实现业务阶段逻辑。阶段逻辑继续由现有 slash command、Agent 定义、governance 文件和项目状态文件决定。

### 2.4 SQLite 索引

SQLite 是本地查询索引和控制面状态库，不是交付真相源。

存储内容：

1. Product / Milestone / Workstream / Task 的索引记录。
2. 项目状态快照、Gate 状态、Agent 运行、日志摘要、Codex 审查摘要。
3. Change Request、Impact Analysis、Patch Plan、Regression、Release 的索引。
4. Memory Vault 的结构化元数据、事实、来源引用和检索向量或关键词索引。
5. 文件路径、mtime、hash、解析摘要和最近同步时间。

恢复原则：SQLite 可以删除并通过文件系统重新索引重建。若 SQLite 与文件系统冲突，以文件系统为准，并在 GUI 标记索引过期或冲突。

### 2.5 File System 产物层

文件系统继续作为交付真相源。

核心路径保持不变：

1. `E:\intake\<客户名>\raw\`：客户原始材料。
2. `E:\projects\<项目名>\`：项目根目录。
3. `E:\projects\<项目名>\.status.json`：项目状态。
4. `E:\projects\<项目名>\doc\`：requirements、charter、prd、design、plan、acceptance、handoff。
5. `G:\qa-reports\<项目名>\`：QA、Security、Reviewer 报告和截图。
6. `G:\logs\agents\`：Agent 运行日志。
7. `H:\claude-assets\lessons\`：跨项目经验库。
8. `I:\archive\`：已交付项目归档。

所有 GUI 展示必须能追溯到具体文件路径。所有关键状态必须最终落盘到项目文件或日志，而不是只存在 SQLite。

### 2.6 Memory Vault

Memory Vault 是长期记忆层，负责把运行轨迹压缩成可检索、可追溯、可过期的知识。

分层：

1. Raw Events：最细粒度事件，例如用户输入、Agent 启动、状态变更、文件变更、审查结论。
2. Episodes：一次完整流程或关键阶段的摘要，例如一次 Gate 失败、一次变更请求、一次二审分歧。
3. Facts：可复用事实，例如客户偏好、项目约束、架构决策、风险、已知限制。
4. Memory Tree：按公司、客户、产品、项目、工作流、Agent、主题组织的层级结构。
5. Retrieval Pack：在启动新会话或 Agent 前动态生成的最小上下文包。

记忆必须包含来源、时间、scope、置信度、过期策略和替代关系。

## 3. 大项目数据模型与状态机

### 3.1 四层结构

大项目采用四层结构：

1. Product：一个长期产品或客户系统，例如“客户门户系统”。
2. Milestone：产品下的阶段性目标，例如“MVP 交付”“支付闭环”“后台管理”。
3. Workstream：可并行推进的工作流，例如“认证系统”“订单系统”“前台 UI”“运维部署”。
4. Task：可执行、可验证的最小任务，例如“实现登录 API”“补齐订单列表 E2E”。

映射关系：

```text
Product 1 ── n Milestone
Milestone 1 ── n Workstream
Workstream 1 ── n Task
```

现有单项目流程可被视为只有一个 Product、一个 Milestone、一个 Workstream 的简化情况。

### 3.2 SQLite 表

以下是控制面索引模型的第一版边界，不替代项目文件：

```sql
products(id, name, client_name, root_path, status, created_at, updated_at)
milestones(id, product_id, name, status, gate_scope, target_date, created_at, updated_at)
workstreams(id, milestone_id, name, status, owner_role, project_path, created_at, updated_at)
tasks(id, workstream_id, title, status, agent_role, priority, acceptance_ref, created_at, updated_at)
gates(id, scope_type, scope_id, gate_name, status, evidence_path, checked_at)
runs(id, scope_type, scope_id, command, status, started_at, finished_at, exit_code, log_path)
artifacts(id, scope_type, scope_id, artifact_type, path, hash, mtime, summary, indexed_at)
```

`scope_type` 取值限定为 `product`、`milestone`、`workstream`、`task`、`project`。`scope_id` 指向对应层级的索引记录。

### 3.3 状态机

Product 状态：

```text
idea → intake → active → maintenance → archived
```

Milestone 状态：

```text
planned → designing → building → validating → ready_to_release → released → closed
```

Workstream 状态：

```text
todo → in_progress → blocked → in_review → done
```

Task 状态：

```text
backlog → todo → in_progress → blocked → review → done → cancelled
```

状态约束：

1. 子级存在 `blocked` 时，父级不得自动进入 `released` 或 `closed`。
2. Workstream 可以并行执行，但同一 Workstream 内写同一项目文件的任务必须串行。
3. 同一项目路径同一时间只允许一个会写入的 Claude Code Runner 运行。
4. 只读索引、状态扫描和日志查看可以并行。

### 3.4 分层 Gate

Gate 可以按以下 scope 生效：

1. project：兼容当前 `Gate 1` 到 `Gate 5`。
2. milestone：用于大版本发布前的整体检查。
3. workstream：用于并行流的局部验收，例如只验收认证流或后台流。

Gate 规则：

1. Gate 条款必须布尔可判定。
2. Gate 证据必须指向文件路径、命令输出、报告路径或人工确认记录。
3. Workstream Gate 通过不代表 Milestone Gate 通过。
4. Milestone Gate 通过必须聚合所有必需 Workstream 的 Gate 状态。
5. 对现有 web-outsource 流程，仍保留 `quality-gates.md` 的 Gate 1 到 Gate 5 作为默认规则。

## 4. 二次迭代与变更请求闭环

交付后的修改必须走标准化变更流程，不能直接重新 `/go`。

### 4.1 流程

```text
Change Request → Impact Analysis → Patch Plan → Regression → Release
```

### 4.2 Change Request

Change Request 记录用户提出的交付后修改、bug、增强或范围调整。

必填字段：

1. 标题。
2. 来源：用户输入、验收反馈、QA 发现、线上问题或内部改进。
3. 影响范围：Product、Milestone、Workstream 或 Project。
4. 当前行为。
5. 期望行为。
6. 验收标准，必须布尔可判定。
7. 优先级。

### 4.3 Impact Analysis

Impact Analysis 由 Control Plane 触发合适 Agent 完成。默认规则：影响技术架构、数据模型、API 或安全边界时由 Architect 主导；只影响排期、任务拆分或验收映射时由 PM 主导；两类影响同时存在时由 Architect 先判断技术边界，PM 再拆 Patch Plan。

输出必须回答：

1. 影响哪些文件、接口、数据模型、测试和文档。
2. 是否改变原 charter、design 或 acceptance-matrix。
3. 是否需要 UX、Backend、Frontend、QA、Security、Reviewer 或 DevOps 参与。
4. 是否影响已发布功能的回归范围。
5. 是否需要用户重新确认范围或预算。

### 4.4 Patch Plan

Patch Plan 是变更请求的实施计划，但不是重新跑完整 `/go`。

要求：

1. 只覆盖变更影响范围。
2. 每个任务必须绑定变更请求验收标准。
3. 必须列出回归测试范围。
4. 涉及安全、认证、支付、权限、数据迁移时必须经过 Security 和 Reviewer。
5. 需要架构变化时必须更新 `doc/design.md` 或追加 ADR。

### 4.5 Regression

Regression 阶段验证变更没有破坏既有交付。

最低要求：

1. 变更请求新增验收标准全部 PASS。
2. 原 acceptance-matrix 中受影响条款全部重跑并 PASS。
3. 相关 E2E 和集成测试通过。
4. 对抗输入、安全基线和 Codex 审查按影响范围执行。

### 4.6 Release

Release 阶段产出变更交付记录。

必须落盘：

1. 变更请求状态。
2. Impact Analysis 文档。
3. Patch Plan 文档。
4. Regression 报告。
5. Release Note。
6. 更新后的 `.status.json`、handoff 和必要 lessons。

## 5. 长期记忆与会话接力

### 5.1 设计参考

记忆机制参考 OpenHuman、mem0、Zep、Letta 的思想，但落地为本地优先、文件可追溯、SQLite 可重建的轻量系统。

核心原则：

1. 记忆不是聊天记录堆积，而是分层压缩后的可用上下文。
2. 每条记忆必须有来源证据。
3. 每条记忆必须有 scope，避免跨客户、跨项目误用。
4. 每条记忆必须有时间，便于判断是否过期。
5. 记忆可以被替代、废弃或降权，不能只追加不清理。

### 5.2 Raw Events

Raw Events 记录系统发生过什么。

事件类型：

1. user_message：用户需求、确认、变更请求。
2. command_run：`/intake`、`/go`、`/recover`、变更流程运行。
3. agent_run：Agent 启动、完成、失败、blocked。
4. file_changed：关键文件变更。
5. gate_result：Gate 检查结果。
6. review_result：Codex、QA、Security、Reviewer 结论。
7. decision：用户或 CEO 确认的决策。

### 5.3 Episodes

Episode 是对一组 Raw Events 的阶段摘要。

常见 Episode：

1. 一次 intake 完成。
2. 一次设计审查完成。
3. 一次 reviewer reopen。
4. 一次 Codex 不可用阻塞。
5. 一次变更请求从提出到发布。

Episode 必须指向相关 Raw Events、产物路径和结论。

### 5.4 Facts

Fact 是可被未来流程复用的事实。

类型：

1. user_preference：用户偏好。
2. project_constraint：项目约束。
3. architecture_decision：架构决策。
4. delivery_fact：交付事实。
5. risk_fact：风险或已知限制。
6. lesson_fact：可迁移经验。

Fact 字段：

```text
id, type, scope_type, scope_id, content, source_event_ids, source_paths,
confidence, valid_from, expires_at, supersedes_id, status
```

`status` 取值为 `active`、`superseded`、`expired`、`rejected`。

### 5.5 Memory Tree

Memory Tree 组织方式：

```text
company
  ├─ client
  │   ├─ product
  │   │   ├─ milestone
  │   │   ├─ workstream
  │   │   └─ change-request
  ├─ agent
  ├─ technology
  └─ lesson
```

Memory Tree 不要求所有节点都有实体文件，但每个可展示节点必须能追溯到 SQLite 记录或文件路径。

### 5.6 Retrieval Pack

Retrieval Pack 是启动一次 Claude Code Runner 或 Agent 前生成的上下文包。

内容上限应小而准：

1. 当前任务目标。
2. 当前 scope 的关键状态。
3. 最近相关 Episodes。
4. active Facts。
5. 相关 lessons。
6. 必须遵守的 governance 摘要。
7. 明确排除的过期或被替代信息。

Retrieval Pack 必须写入运行记录，便于复盘某次 Agent 为什么这样决策。

## 6. Web GUI / 本地应用

### 6.1 第一阶段形态

第一阶段只做本地 Web：

1. 本地 HTTP 服务监听 localhost。
2. 浏览器访问 Web Console。
3. Control Plane 与 Claude Code Runner 在本机执行。
4. SQLite 和文件系统均在本机。

后续如需要桌面化，再封装 Tauri 或 Electron。桌面壳不得改变核心架构，只包装本地 Web 服务和配置启动流程。

### 6.2 页面规格

#### 公司看板

展示：

1. 活跃 Product、Milestone、Workstream 数量。
2. 阻塞项目列表。
3. Gate 失败或 warning 列表。
4. 最近 Agent 运行状态。
5. Codex 不可用、reopenCount >= 3、长时间 in_progress 等告警。
6. 下一步建议动作。

#### 项目详情

展示：

1. 项目基础信息和路径。
2. `.status.json` 当前状态。
3. charter、prd、design、plan、acceptance-matrix、handoff 文件链接。
4. Gate 证据矩阵。
5. Agent 运行时间线。
6. QA、Security、Reviewer 报告。
7. 变更请求列表。

#### 迭代中心

展示并操作：

1. 创建 Change Request。
2. 查看 Impact Analysis。
3. 查看和启动 Patch Plan。
4. 查看 Regression 结果。
5. 生成 Release Note。
6. 阻止未完成 Regression 的 Release。

#### Agent 运行中心

展示并操作：

1. 当前队列。
2. 正在运行的 Claude Code Runner。
3. 历史运行日志。
4. 失败原因和 blocked 原因。
5. Codex 审查输出。
6. 允许在明确确认后重跑失败流程。

#### 记忆浏览器

展示：

1. Raw Events 检索。
2. Episodes 列表。
3. Facts 列表和状态。
4. Memory Tree。
5. 某次运行的 Retrieval Pack。
6. 记忆的来源、时间、scope、过期和替代关系。

#### 设置页

配置：

1. `E:\intake`、`E:\projects`、`G:\qa-reports`、`G:\logs`、`H:\claude-assets`、`I:\archive` 路径。
2. Claude Code headless 命令模板。
3. 最大并发运行数。
4. SQLite 数据库路径。
5. Memory Vault 压缩周期。
6. Codex 可用性检查方式。

## 7. Control Plane 行为规则

### 7.1 写入规则

1. 关键产物必须先写文件，再更新 SQLite 索引。
2. SQLite 更新失败时，不得声明流程完成；GUI 应显示索引失败但文件已落盘。
3. 文件写入失败时，不得只写 SQLite。
4. 对同一项目路径的写操作必须加项目级锁。
5. 对同一文件的写操作必须检查 mtime 或 hash，发现外部修改时停止并提示冲突。

### 7.2 并发规则

允许并行：

1. 不同项目的只读扫描。
2. 不同项目的互不影响流程。
3. 同一 Product 下不同 Workstream 的只读分析。
4. 日志读取、报告展示、记忆检索。

必须串行：

1. 同一项目路径的写入型 Runner。
2. 同一 `.status.json` 的更新。
3. 同一 handoff 文件的写入。
4. 同一 Change Request 的 Patch Plan 执行。

### 7.3 失败处理

1. Codex 不可用：按 `codex-prompts.md` 停止流程，不降级、不跳过。
2. Agent blocked：停止自动推进，GUI 标记阻塞并展示 blockReason。
3. Reviewer reopen：按 `SOP.md` 增加 reopenCount，未满 3 次可重新进入 Dev → QA → Security → Reviewer；达到 3 次必须请求用户决策。
4. SQLite 索引损坏：停止写入索引，保留文件系统，提供重建索引入口。
5. 文件系统与索引冲突：以文件系统为准，并记录冲突事件。

## 8. MVP 边界与阶段落地

### 8.1 Phase 0：索引现状

目标：只读扫描现有资产，建立最小 SQLite 索引。

范围：

1. 扫描 `E:\projects`、`G:\qa-reports`、`G:\logs`、`H:\claude-assets\lessons`。
2. 索引项目、状态、Gate、handoff、报告和日志路径。
3. 提供命令行或最小页面查看索引结果。

验收：

1. 删除 SQLite 后可重新索引。
2. 至少一个现有项目能展示状态、handoff 和 QA 报告路径。
3. 不修改任何项目文件。

### 8.2 Phase 1：控制平面 MVP

目标：通过本地 Web 启动和观察现有流程。

范围：

1. Web Console 基础看板。
2. Control Plane 项目扫描。
3. Claude Code Runner 启动 `/intake`、`/go`、`/recover`。
4. Agent 运行日志捕获。
5. 基础阻塞和 Gate 状态展示。

验收：

1. 能从 GUI 启动一个项目流程。
2. 能看到运行中、成功、失败、blocked 四类状态。
3. 能打开对应文件路径查看产物。
4. 不改变现有 `/go` 语义。

### 8.3 Phase 2：迭代闭环

目标：支持交付后变更请求流程。

范围：

1. Change Request 创建。
2. Impact Analysis 文档生成。
3. Patch Plan 文档生成。
4. Regression 报告索引。
5. Release Note 生成。

验收：

1. 交付后修改必须绑定 Change Request。
2. 未完成 Regression 时不能标记 Release。
3. 变更影响范围能追溯到文件和测试。

### 8.4 Phase 3：记忆系统

目标：建立 Raw Events → Episodes → Facts → Memory Tree → Retrieval Pack。

范围：

1. 记录 Raw Events。
2. 生成 Episodes。
3. 提取 Facts。
4. 支持 scope、来源、时间、过期和替代。
5. Runner 启动前生成 Retrieval Pack。

验收：

1. 每条 Fact 都能看到来源。
2. 过期或 superseded 的 Fact 不进入默认 Retrieval Pack。
3. 某次 Agent 运行能回看当时使用的 Retrieval Pack。

### 8.5 Phase 4：大项目工作流

目标：支持 Product / Milestone / Workstream / Task 四层和分层 Gate。

范围：

1. 四层数据模型。
2. Workstream 并行状态展示。
3. project / milestone / workstream Gate 聚合。
4. 项目级写锁。

验收：

1. 同一 Product 下至少两个 Workstream 可并行跟踪。
2. Milestone Gate 能聚合 Workstream Gate。
3. 同一项目路径不会出现两个写入型 Runner 并发执行。

### 8.6 Phase 5：本地应用

目标：在本地 Web 稳定后封装为桌面应用。

范围：

1. Tauri 或 Electron 壳。
2. 本地服务启动和停止。
3. 配置路径检查。
4. 日志目录打开。

验收：

1. 双击启动后能打开 Web Console。
2. 关闭应用时能安全停止本地服务。
3. 桌面壳不改变 Control Plane、Runner、SQLite 和文件系统职责。

## 9. 风险与约束

### 9.1 范围风险

风险：六层架构、迭代闭环、记忆系统和大项目工作流一起做会过大。  
约束：必须按 Phase 0 到 Phase 5 分阶段交付。Phase 1 不实现完整记忆系统和大项目四层工作流。

### 9.2 真相源冲突

风险：SQLite 和文件系统可能出现状态不一致。  
约束：文件系统永远优先。SQLite 必须可重建，GUI 必须显示索引时间和冲突状态。

### 9.3 Headless Runner 不稳定

风险：Claude Code headless 运行可能因权限、模型、Codex、网络或 prompt 失败。  
约束：Runner 必须记录完整运行日志、退出码和 blockReason，不得静默重试掩盖失败。

### 9.4 并发写入风险

风险：并行 Workstream 可能写同一个 `.status.json`、handoff 或项目文件。  
约束：Control Plane 必须提供项目级写锁和文件 mtime/hash 冲突检查。

### 9.5 记忆污染风险

风险：错误、过期或跨客户信息进入 Retrieval Pack。  
约束：Fact 必须带 scope、来源、时间、状态和替代关系。默认检索只使用 active 且 scope 匹配的 Fact。

### 9.6 GUI 越权风险

风险：GUI 直接编辑产物会绕过治理流程。  
约束：GUI 不直接写项目源文件；所有流程性写入必须通过 Control Plane 和 Runner，并保留事件记录。

### 9.7 质量门弱化风险

风险：控制面为了方便重跑而绕过 Codex 双审或 Gate。  
约束：Control Plane 只能展示和触发现有流程，不允许跳过 `quality-gates.md`、`codex-prompts.md`、handoff-schema 和 `.status.json` 状态规则。

## 10. 验收标准

1. 规格明确规定文件系统是交付真相源，SQLite 是可重建索引。
2. 规格包含 Web Console、Control Plane、Claude Code Runner、SQLite、File System、Memory Vault 六层职责。
3. 规格包含 Product / Milestone / Workstream / Task 四层模型。
4. 规格包含 project / milestone / workstream 三类 Gate scope。
5. 规格包含 Change Request → Impact Analysis → Patch Plan → Regression → Release 闭环。
6. 规格包含 Raw Events → Episodes → Facts → Memory Tree → Retrieval Pack 记忆链路。
7. 规格包含本地 Web 优先、Tauri / Electron 后置的落地策略。
8. 规格包含 Phase 0 到 Phase 5 的阶段边界和验收。
9. 规格声明不替换现有 `/intake`、`/go`、Agent 定义、质量门和 Codex 双审。
10. 规格没有要求第一阶段实现云端、多用户、权限、支付或公网部署。

## 11. 自审记录

**自审时间：** 2026-05-23  
**自审结果：** 通过

### 检查清单

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 完整性 | ✅ | 全文无 TBD、TODO 或占位符，所有章节已填写完整 |
| 一致性 | ✅ | "文件系统是真相源，SQLite 是索引"原则贯穿架构、风险、阶段和验收标准 |
| 范围合理性 | ✅ | 总目标拆分为 6 个 Phase，MVP 限定在 Phase 0-1，避免一次性过大 |
| 无歧义 | ✅ | 状态机、Gate scope、并发规则、记忆字段、变更流程均有明确约束 |
| 治理保留 | ✅ | 明确声明不替换现有 `/intake`、`/go`、Agent、质量门和 Codex 双审 |
| 非目标明确 | ✅ | 明确排除云端、多用户、权限、支付、公网部署 |
| 验收可判定 | ✅ | 10 条验收标准均为布尔可判定 |

### 潜在风险已识别

1. 范围风险 → 约束：分阶段交付
2. 真相源冲突 → 约束：文件系统优先，SQLite 可重建
3. Headless Runner 不稳定 → 约束：记录完整日志和 blockReason
4. 并发写入风险 → 约束：项目级写锁 + mtime/hash 冲突检查
5. 记忆污染风险 → 约束：scope + 来源 + 时间 + 状态 + 替代关系
6. GUI 越权风险 → 约束：GUI 不直接写项目文件
7. 质量门弱化风险 → 约束：Control Plane 不允许跳过治理流程

### 结论

本规格已完成设计确认，可进入实施计划阶段。