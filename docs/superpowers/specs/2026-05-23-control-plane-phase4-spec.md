# Control Plane Phase 4: 完整 CRUD + 压缩触发器规格文档

> **范围说明：** 本文档描述的是记忆系统 CRUD 增强（批量操作、版本控制、审计日志、软删除、压缩触发器），属于 **记忆系统后续增强候选方案**，不是当前 Phase 4（大项目工作流）的执行范围。当前 Phase 4 已完成，见 `docs/superpowers/plans/phase-4-implementation-plan.md`。

**版本**: 1.0  
**日期**: 2026-05-23  
**状态**: 归档（非当前 Phase 4 范围）  
**作者**: Architect Agent  

---

## 1. 背景与目标

### 1.1 当前状态
Phase 3 已实现记忆系统 MVP，包括：
- 基础 CRUD API（创建、读取、更新、删除记忆）
- 记忆检索与压缩机制
- Web 控制台集成

### 1.2 问题陈述
当前实现存在以下限制：
1. **API 不完整**：缺少批量操作、分页、搜索等企业级功能
2. **压缩触发不灵活**：仅支持手动触发，无法根据业务规则自动压缩
3. **数据模型不规范**：缺少版本控制、审计日志、软删除等机制
4. **测试覆盖不足**：缺少边界条件、并发场景、性能测试

### 1.3 目标
Phase 4 将记忆系统从 MVP 升级为生产就绪状态：
- **完整 CRUD**：支持批量操作、分页、搜索、过滤
- **灵活压缩触发**：支持手动、定时、阈值、事件驱动四种触发方式
- **规范数据模型**：添加版本控制、审计日志、软删除
- **完善测试**：达到 90%+ 代码覆盖率，包含性能测试

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Control Plane API                       │
├─────────────────────────────────────────────────────────────┤
│  Memory CRUD API (Phase 4)                                   │
│  ├─ 单条操作: POST/GET/PUT/DELETE /api/memory/:id           │
│  ├─ 批量操作: POST /api/memory/batch                         │
│  ├─ 查询操作: GET /api/memory?page=1&limit=20&q=keyword     │
│  └─ 压缩触发: POST /api/memory/compress                      │
├─────────────────────────────────────────────────────────────┤
│  Compression Trigger System (Phase 4)                        │
│  ├─ Manual: 手动触发 (API)                                   │
│  ├─ Scheduled: 定时触发 (Cron)                               │
│  ├─ Threshold: 阈值触发 (记忆数量/大小)                      │
│  └─ Event-driven: 事件触发 (Webhook)                         │
├─────────────────────────────────────────────────────────────┤
│  Data Layer (Phase 4)                                        │
│  ├─ Memory Store (SQLite)                                    │
│  ├─ Version Control (Git-like)                               │
│  ├─ Audit Log (Append-only)                                  │
│  └─ Soft Delete (Tombstone)                                  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 技术栈
- **后端**: Node.js + Express.js
- **数据库**: SQLite (better-sqlite3)
- **测试**: Jest + Supertest
- **压缩引擎**: Claude API (复用 Phase 3)
- **定时任务**: node-cron

---

## 3. 数据模型

### 3.1 核心表结构

#### 3.1.1 memories 表（扩展）
```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,  -- JSON: {tags, source, priority}
  
  -- Phase 4 新增字段
  version INTEGER DEFAULT 1,
  parent_id TEXT,  -- 指向上一版本
  is_deleted INTEGER DEFAULT 0,  -- 软删除标记
  deleted_at TEXT,
  deleted_by TEXT,
  
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (parent_id) REFERENCES memories(id)
);

CREATE INDEX idx_memories_company ON memories(company_id);
CREATE INDEX idx_memories_deleted ON memories(is_deleted);
CREATE INDEX idx_memories_version ON memories(parent_id, version);
```

#### 3.1.2 memory_audit_log 表（新增）
```sql
CREATE TABLE memory_audit_log (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  action TEXT NOT NULL,  -- 'create', 'update', 'delete', 'compress'
  actor TEXT NOT NULL,   -- user_id or 'system'
  changes TEXT,          -- JSON diff
  timestamp TEXT NOT NULL,
  
  FOREIGN KEY (memory_id) REFERENCES memories(id)
);

CREATE INDEX idx_audit_memory ON memory_audit_log(memory_id);
CREATE INDEX idx_audit_timestamp ON memory_audit_log(timestamp);
```

#### 3.1.3 compression_triggers 表（新增）
```sql
CREATE TABLE compression_triggers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'manual', 'scheduled', 'threshold', 'event'
  config TEXT NOT NULL,  -- JSON: {cron, threshold, webhook_url}
  enabled INTEGER DEFAULT 1,
  last_run TEXT,
  next_run TEXT,
  created_at TEXT NOT NULL,
  
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE INDEX idx_triggers_company ON compression_triggers(company_id);
CREATE INDEX idx_triggers_next_run ON compression_triggers(next_run);
```

### 3.2 数据流
```
1. 创建记忆
   User → POST /api/memory → memories (version=1) → audit_log (action='create')

2. 更新记忆
   User → PUT /api/memory/:id → memories (version++, parent_id=old_id) → audit_log (action='update')

3. 删除记忆
   User → DELETE /api/memory/:id → memories (is_deleted=1) → audit_log (action='delete')

4. 压缩触发
   Trigger → POST /api/memory/compress → Claude API → memories (new compressed) → audit_log (action='compress')
```

---

## 4. API 设计

### 4.1 完整 CRUD API

#### 4.1.1 创建记忆
```http
POST /api/memory
Content-Type: application/json

{
  "companyId": "comp_123",
  "content": "用户偏好使用 TypeScript",
  "metadata": {
    "tags": ["preference", "tech-stack"],
    "source": "chat",
    "priority": "high"
  }
}

Response 201:
{
  "id": "mem_abc",
  "companyId": "comp_123",
  "content": "用户偏好使用 TypeScript",
  "metadata": {...},
  "version": 1,
  "createdAt": "2026-05-23T10:00:00Z"
}
```

#### 4.1.2 批量创建
```http
POST /api/memory/batch
Content-Type: application/json

{
  "companyId": "comp_123",
  "memories": [
    {"content": "记忆1", "metadata": {...}},
    {"content": "记忆2", "metadata": {...}}
  ]
}

Response 201:
{
  "created": 2,
  "ids": ["mem_abc", "mem_def"]
}
```

#### 4.1.3 查询记忆（分页 + 搜索）
```http
GET /api/memory?companyId=comp_123&page=1&limit=20&q=TypeScript&tags=preference

Response 200:
{
  "data": [
    {
      "id": "mem_abc",
      "content": "用户偏好使用 TypeScript",
      "metadata": {...},
      "version": 2,
      "createdAt": "2026-05-23T10:00:00Z",
      "updatedAt": "2026-05-23T11:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

#### 4.1.4 获取单条记忆
```http
GET /api/memory/:id

Response 200:
{
  "id": "mem_abc",
  "companyId": "comp_123",
  "content": "用户偏好使用 TypeScript",
  "metadata": {...},
  "version": 2,
  "parentId": "mem_abc_v1",
  "createdAt": "2026-05-23T10:00:00Z",
  "updatedAt": "2026-05-23T11:00:00Z"
}
```

#### 4.1.5 更新记忆
```http
PUT /api/memory/:id
Content-Type: application/json

{
  "content": "用户偏好使用 TypeScript 和 React",
  "metadata": {
    "tags": ["preference", "tech-stack", "frontend"]
  }
}

Response 200:
{
  "id": "mem_abc",
  "version": 3,
  "parentId": "mem_abc_v2",
  "updatedAt": "2026-05-23T12:00:00Z"
}
```

#### 4.1.6 删除记忆（软删除）
```http
DELETE /api/memory/:id

Response 204 No Content
```

#### 4.1.7 批量删除
```http
DELETE /api/memory/batch
Content-Type: application/json

{
  "ids": ["mem_abc", "mem_def"]
}

Response 200:
{
  "deleted": 2
}
```

### 4.2 压缩触发 API

#### 4.2.1 手动触发压缩
```http
POST /api/memory/compress
Content-Type: application/json

{
  "companyId": "comp_123",
  "options": {
    "maxTokens": 4000,
    "preserveTags": ["critical"]
  }
}

Response 202:
{
  "jobId": "job_xyz",
  "status": "processing",
  "estimatedTime": "30s"
}
```

#### 4.2.2 创建定时触发器
```http
POST /api/memory/triggers
Content-Type: application/json

{
  "companyId": "comp_123",
  "type": "scheduled",
  "config": {
    "cron": "0 2 * * *",  // 每天凌晨 2 点
    "timezone": "Asia/Shanghai"
  }
}

Response 201:
{
  "id": "trigger_123",
  "type": "scheduled",
  "nextRun": "2026-05-24T02:00:00+08:00"
}
```

#### 4.2.3 创建阈值触发器
```http
POST /api/memory/triggers
Content-Type: application/json

{
  "companyId": "comp_123",
  "type": "threshold",
  "config": {
    "maxMemories": 1000,
    "maxSizeMB": 10
  }
}

Response 201:
{
  "id": "trigger_124",
  "type": "threshold",
  "enabled": true
}
```

#### 4.2.4 查询触发器
```http
GET /api/memory/triggers?companyId=comp_123

Response 200:
{
  "data": [
    {
      "id": "trigger_123",
      "type": "scheduled",
      "config": {...},
      "enabled": true,
      "lastRun": "2026-05-23T02:00:00Z",
      "nextRun": "2026-05-24T02:00:00Z"
    }
  ]
}
```

#### 4.2.5 更新触发器
```http
PUT /api/memory/triggers/:id
Content-Type: application/json

{
  "enabled": false
}

Response 200:
{
  "id": "trigger_123",
  "enabled": false
}
```

#### 4.2.6 删除触发器
```http
DELETE /api/memory/triggers/:id

Response 204 No Content
```

---

## 5. 实现计划

### 5.1 分阶段实施

#### Phase 4.1: 数据模型升级（2 天）
- [ ] 扩展 memories 表（version, parent_id, is_deleted）
- [ ] 创建 memory_audit_log 表
- [ ] 创建 compression_triggers 表
- [ ] 编写数据库迁移脚本
- [ ] 单元测试：数据模型

#### Phase 4.2: 完整 CRUD API（3 天）
- [ ] 实现批量创建 API
- [ ] 实现分页查询 API
- [ ] 实现搜索过滤 API
- [ ] 实现批量删除 API
- [ ] 实现软删除逻辑
- [ ] 集成测试：CRUD API

#### Phase 4.3: 版本控制与审计（2 天）
- [ ] 实现记忆版本控制
- [ ] 实现审计日志记录
- [ ] 实现版本历史查询 API
- [ ] 单元测试：版本控制

#### Phase 4.4: 压缩触发系统（3 天）
- [ ] 实现手动触发 API
- [ ] 实现定时触发器（node-cron）
- [ ] 实现阈值触发器
- [ ] 实现事件触发器（Webhook）
- [ ] 集成测试：触发器系统

#### Phase 4.5: 性能优化与测试（2 天）
- [ ] 添加数据库索引
- [ ] 实现查询缓存
- [ ] 性能测试（1000+ 记忆）
- [ ] 并发测试（10+ 并发请求）
- [ ] 压力测试（压缩大量记忆）

#### Phase 4.6: 文档与部署（1 天）
- [ ] 更新 API 文档
- [ ] 编写运维手册
- [ ] 部署到测试环境
- [ ] 端到端测试

**总计**: 13 天

### 5.2 里程碑
- **M1 (Day 5)**: 数据模型 + CRUD API 完成
- **M2 (Day 10)**: 版本控制 + 触发器系统完成
- **M3 (Day 13)**: 性能优化 + 文档完成，进入测试环境

---

## 6. 风险与缓解

### 6.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| SQLite 性能瓶颈（大量记忆） | 高 | 中 | 添加索引、分页、缓存；考虑迁移到 PostgreSQL |
| 版本控制导致数据膨胀 | 中 | 高 | 实现版本清理策略（保留最近 N 个版本） |
| 定时任务失败（node-cron） | 中 | 低 | 添加任务监控、失败重试、告警机制 |
| 并发写入冲突 | 高 | 中 | 使用事务、乐观锁、重试机制 |

### 6.2 业务风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 压缩导致关键信息丢失 | 高 | 低 | 实现 `preserveTags` 机制、压缩前备份 |
| 软删除导致数据泄漏 | 中 | 低 | 实现硬删除 API（仅管理员）、定期清理 |
| API 滥用（批量操作） | 中 | 中 | 添加速率限制、批量操作上限（100 条） |

### 6.3 时间风险
- **依赖 Phase 3**: 如果 Phase 3 有 bug，需要先修复
- **测试时间不足**: 预留 2 天缓冲时间
- **需求变更**: 冻结需求，变更进入 Phase 5

---

## 7. 验收标准

### 7.1 功能验收
- [ ] 所有 CRUD API 正常工作
- [ ] 批量操作支持 100 条记忆
- [ ] 分页查询支持 1000+ 记忆
- [ ] 搜索过滤准确率 95%+
- [ ] 版本控制正确记录历史
- [ ] 审计日志完整记录操作
- [ ] 软删除不影响查询性能
- [ ] 四种触发器正常工作

### 7.2 性能验收
- [ ] 单条查询 < 50ms (P95)
- [ ] 批量创建 100 条 < 500ms (P95)
- [ ] 分页查询 < 100ms (P95)
- [ ] 压缩 1000 条记忆 < 60s (P95)
- [ ] 并发 10 请求无错误

### 7.3 测试验收
- [ ] 单元测试覆盖率 > 90%
- [ ] 集成测试覆盖所有 API
- [ ] 性能测试通过
- [ ] 并发测试通过
- [ ] 端到端测试通过

---

## 8. 附录

### 8.1 API 错误码
| 错误码 | 说明 | HTTP 状态码 |
|--------|------|-------------|
| `MEMORY_NOT_FOUND` | 记忆不存在 | 404 |
| `INVALID_PAGINATION` | 分页参数无效 | 400 |
| `BATCH_LIMIT_EXCEEDED` | 批量操作超限 | 400 |
| `COMPRESSION_FAILED` | 压缩失败 | 500 |
| `TRIGGER_CONFLICT` | 触发器冲突 | 409 |

### 8.2 配置示例
```json
{
  "memory": {
    "maxBatchSize": 100,
    "defaultPageSize": 20,
    "maxPageSize": 100,
    "softDeleteRetentionDays": 30,
    "versionRetentionCount": 10
  },
  "compression": {
    "defaultMaxTokens": 4000,
    "scheduledCron": "0 2 * * *",
    "thresholdMaxMemories": 1000,
    "thresholdMaxSizeMB": 10
  }
}
```

### 8.3 参考资料
- [Phase 3 实现](../../../control-plane/src/memoryApi.js)
- [数据库设计](../../../control-plane/src/db.js)
- [测试用例](../../../control-plane/tests/memoryApi.test.js)

---

**文档结束**

---

## 自审清单

### 完整性
- [x] 背景与目标清晰
- [x] 架构设计完整
- [x] 数据模型详细
- [x] API 设计规范
- [x] 实现计划可行
- [x] 风险识别充分
- [x] 验收标准明确

### 可行性
- [x] 技术栈成熟
- [x] 时间估算合理（13 天）
- [x] 依赖关系清晰
- [x] 风险缓解措施具体

### 一致性
- [x] 与 Phase 3 兼容
- [x] API 风格统一
- [x] 数据模型规范
- [x] 错误处理一致

### 待 Codex 审核
- [ ] 架构设计是否合理？
- [ ] API 设计是否符合 RESTful 规范？
- [ ] 数据模型是否支持未来扩展？
- [ ] 性能指标是否现实？
- [ ] 风险缓解措施是否充分？
