# Phase 5 候选计划

> 日期：2026-05-23  
> 状态：候选（未开始）  
> 前置：Phase 4 已完成（大项目工作流 + 并发控制 + 产品树 UI）  
> 参考：gstack 架构分析（2026-05-23）

---

## 背景

Phase 4 完成后，系统已具备：
- 本地控制平面（Express + SQLite）
- 四层项目结构（Product / Milestone / Workstream / Task）
- 分层 Gate（project / milestone / workstream scope）
- 项目级并发写锁
- 四层记忆系统（Raw Events → Episodes → Facts → Retrieval Pack）
- Web Console（左右布局 + 产品树 + 迭代中心 + 记忆中心）
- 变更请求闭环（CR → IA → Patch → Regression → Release）

Phase 5 目标：**提升系统的可用性、可观测性和智能化程度**，同时借鉴 gstack 的优秀设计。

---

## 迭代 A：清理与稳定（本次迭代，已完成）

### 已完成
- [x] 删除嵌套目录 `control-plane/control-plane/`
- [x] 删除死代码 `hierarchyApi.js`、`hierarchyStore.js`
- [x] 归档旧 `dashboard/` 到 `_archive/dashboard-legacy/`
- [x] 更新 Phase 4 验收标准 checkbox
- [x] 修复 `failingGates` 字段名兼容（`gate.name || gate.gateName`）
- [x] 修复 `commandBuilder.js` 错误信息
- [x] 全量测试：24 文件 263 测试全部通过

---

## 迭代 B：Learnings 记忆增强（借鉴 gstack）

**目标：** 把 gstack 的 JSONL learnings 模式引入我们的记忆系统，作为 Facts 层的轻量补充。

### 核心设计

```
用户/Agent 执行中发现经验
         ↓
POST /api/memory/learnings  (append-only JSONL + SQLite 双写)
         ↓
GET /api/memory/learnings?q=<keyword>&limit=3
         ↓
Runner 启动前自动注入最近 3 条相关 learning 到 Retrieval Pack
```

### 任务清单

- [ ] `db.js`：新增 `learnings` 表（id, key, type, insight, confidence, source, scope_type, scope_id, created_at）
- [ ] `store.js`：`createLearning`、`searchLearnings(q, limit)`（按 key+type 去重取最新）
- [ ] `app.js`：`POST /api/memory/learnings`、`GET /api/memory/learnings`
- [ ] `runner/commandBuilder.js`：`buildPrompt` 支持注入 learnings 上下文
- [ ] `app.js`：`/api/runs` 启动前查询相关 learnings 并注入 prompt
- [ ] Web Console 记忆中心：新增 Learnings tab
- [ ] 测试：learnings CRUD + 注入逻辑

### 验收标准
- [ ] 每条 learning 有 key/type/insight/confidence/source
- [ ] 相同 key+type 的 learning 查询时去重取最新
- [ ] Runner 启动时自动注入最多 3 条相关 learning
- [ ] Web Console 可以查看和手动添加 learning

---

## 迭代 C：发布流水线（借鉴 gstack /ship）

**目标：** 在变更请求闭环之上，增加标准化的发布流程。

### 核心设计

```
CR released
    ↓
POST /api/change-requests/:id/release-note  (生成 Release Note)
    ↓
PATCH /api/projects/:name/version  (更新版本号)
    ↓
POST /api/change-requests/:id/archive  (归档 CR，更新 lessons)
```

### 任务清单

- [ ] `app.js`：`POST /api/change-requests/:id/release-note`（触发 release phase runner）
- [ ] `app.js`：`POST /api/change-requests/:id/archive`（状态 released → archived，写 lessons）
- [ ] Web Console 迭代中心：released CR 显示"生成 Release Note"和"归档"按钮
- [ ] `runner/commandBuilder.js`：`buildPatchPrompt` release phase 已有，补 archive phase
- [ ] 测试：release note 生成 + 归档流程

### 验收标准
- [ ] released CR 可以一键生成 Release Note 文件
- [ ] 归档后 CR 状态变为 archived，lessons 自动追加
- [ ] Web Console 可以查看历史 Release Note

---

## 迭代 D：Checkpoint 机制（借鉴 gstack /context-save）

**目标：** 在 Agent 运行中心加"保存检查点"功能，记录当前决策和上下文。

### 核心设计

```
用户点击"保存检查点"
    ↓
POST /api/projects/:name/checkpoints
    ↓
生成 <timestamp>-<title>.md
    ↓
存入 E:\projects\<name>\doc\checkpoints\
    ↓
索引到 SQLite artifacts 表
```

### Checkpoint 文件格式（借鉴 gstack）

```markdown
# Checkpoint: <title>

**时间：** 2026-05-23T18:00:00Z  
**项目：** <name>  
**阶段：** <phase>

## 当前状态
- 已完成：...
- 进行中：...
- 待处理：...

## 关键决策
- ...

## 注意事项
- ...

## 剩余工作
- ...
```

### 任务清单

- [ ] `app.js`：`POST /api/projects/:name/checkpoints`（生成 checkpoint 文件 + 索引）
- [ ] `app.js`：`GET /api/projects/:name/checkpoints`（列出历史 checkpoint）
- [ ] Web Console 项目详情：新增 Checkpoints 面板
- [ ] 测试：checkpoint 创建 + 列表

### 验收标准
- [ ] 每个 checkpoint 有时间戳、标题、状态、决策、注意事项
- [ ] checkpoint 文件落盘到项目目录
- [ ] Web Console 可以查看历史 checkpoint 列表

---

## 迭代 E：ETHOS 注入（借鉴 gstack ETHOS.md）

**目标：** 把系统核心原则注入每个 Agent 的 preamble，确保所有 Agent 共享同一套价值观。

### 核心设计

gstack 的 ETHOS.md 包含：
- Builder Ethos（Boil the Lake、Search Before Building、User Sovereignty）
- 每个 skill 的 preamble 自动 source ETHOS.md

我们的对应设计：
- 创建 `H:\claude-assets\companies\web-outsource\governance\ethos.md`
- 内容：质量门不可跳过、文件系统是真相源、Codex 双审不降级、有歧义就问
- 在 `governance/SOP.md` 的 Agent 启动流程里加"读 ethos.md"步骤

### 任务清单

- [ ] 创建 `governance/ethos.md`（核心原则 + 禁忌清单）
- [ ] 更新 `governance/SOP.md`：Agent 启动时读 ethos.md
- [ ] 更新 12 个 Agent 定义文件：frontmatter 加 `ethos: H:\claude-assets\companies\web-outsource\governance\ethos.md`

### 验收标准
- [ ] ethos.md 包含至少 5 条布尔可判定的原则
- [ ] 所有 Agent 定义文件引用 ethos.md
- [ ] SOP.md 明确要求 Agent 启动时读 ethos.md

---

## 迭代 F：桌面应用封装（Phase 5 原始目标）

**目标：** 把本地 Web 封装为桌面应用（Tauri 或 Electron）。

> 注意：这是原始规格 Phase 5 的目标，但优先级低于 B-E，建议在 B-E 稳定后再做。

### 任务清单

- [ ] 评估 Tauri vs Electron（Tauri 更轻量，Electron 更成熟）
- [ ] 创建桌面壳项目
- [ ] 封装 control-plane 启动/停止
- [ ] 配置路径检查（E:\projects、G:\logs 等）
- [ ] 双击启动后打开 Web Console
- [ ] 关闭应用时安全停止 control-plane

### 验收标准
- [ ] 双击启动后能打开 Web Console
- [ ] 关闭应用时能安全停止本地服务
- [ ] 桌面壳不改变 Control Plane、Runner、SQLite 和文件系统职责

---

## 优先级排序

| 迭代 | 价值 | 难度 | 优先级 |
|------|------|------|--------|
| B：Learnings 记忆增强 | 高（直接提升 Agent 质量） | 低 | P0 |
| C：发布流水线 | 中（完善 CR 闭环） | 低 | P1 |
| D：Checkpoint 机制 | 中（提升可观测性） | 低 | P1 |
| E：ETHOS 注入 | 高（提升 Agent 一致性） | 极低 | P0 |
| F：桌面应用封装 | 低（体验提升） | 高 | P3 |

**建议执行顺序：** E → B → D → C → F

---

## gstack 借鉴总结

| gstack 特性 | 我们的对应计划 |
|------------|--------------|
| JSONL learnings + dedup | 迭代 B：Learnings 记忆增强 |
| Preamble 自动注入 3 条 learning | 迭代 B：Runner 启动前注入 |
| /context-save checkpoint | 迭代 D：Checkpoint 机制 |
| ETHOS.md 注入每个 skill | 迭代 E：ETHOS 注入 |
| /ship 发布流水线 | 迭代 C：发布流水线 |
| Browse daemon state file | 未来：如需浏览器集成可参考 |
| 双盲 Codex /codex skill | 已有：codex-prompts.md 六模板 |
