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

分层：Raw Events → Episodes → Facts → Memory Tree → Retrieval Pack。

记忆必须包含来源、时间、scope、置信度、过期策略和替代关系。

## 3. 大项目数据模型与状态机

大项目采用 Product / Milestone / Workstream / Task 四层结构。现有单项目流程可被视为只有一个 Product、一个 Milestone、一个 Workstream 的简化情况。

Gate 可以按 project、milestone、workstream 三种 scope 生效。Gate 条款必须布尔可判定，证据必须指向文件路径、命令输出、报告路径或人工确认记录。

## 4. 二次迭代与变更请求闭环

交付后的修改必须走 `Change Request → Impact Analysis → Patch Plan → Regression → Release`，不能直接重新 `/go`。

Impact Analysis 默认规则：影响技术架构、数据模型、API 或安全边界时由 Architect 主导；只影响排期、任务拆分或验收映射时由 PM 主导；两类影响同时存在时由 Architect 先判断技术边界，PM 再拆 Patch Plan。

## 5. MVP 边界与阶段落地

1. Phase 0：索引现状，只读扫描现有资产，建立最小 SQLite 索引。
2. Phase 1：控制平面 MVP，通过本地 Web 启动和观察现有流程。
3. Phase 2：迭代闭环。
4. Phase 3：记忆系统。
5. Phase 4：大项目工作流。
6. Phase 5：本地应用。

本次实施只覆盖 Phase 0 和 Phase 1。

## 6. 风险与约束

1. 文件系统永远优先。SQLite 必须可重建，GUI 必须显示索引时间和冲突状态。
2. Runner 必须记录完整运行日志、退出码和 blockReason，不得静默重试掩盖失败。
3. Control Plane 必须提供项目级写锁和文件 mtime/hash 冲突检查。
4. GUI 不直接写项目源文件；所有流程性写入必须通过 Control Plane 和 Runner。
5. Control Plane 不允许跳过 `quality-gates.md`、`codex-prompts.md`、handoff-schema 和 `.status.json` 状态规则。

## 7. 自审记录

1. 完整性检查：全文不保留未填写项或临时标记。
2. 一致性检查：SQLite 只作索引、文件系统作真相源的原则在架构、风险和阶段中保持一致。
3. 范围检查：总目标已拆分为 Phase 0 到 Phase 5；首期实施限定在 Phase 0 和 Phase 1。
4. 歧义检查：Gate scope、状态机、变更流程、记忆字段、并发写入规则均给出明确约束。
5. 治理检查：保留现有 SOP、quality gates、handoff schema、Codex 双审和 lessons 机制。
