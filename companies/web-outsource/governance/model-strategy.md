# 模型与协商策略（公司级，2026-05-11 生效）

> 公司：web-outsource
> 修订人：CEO
> 适用范围：所有 agent 的每次 heartbeat

---

## 一、模型分配（"关键时刻用 Opus" + Codex 全员双盲）

| 角色 | 日常模型 | 升 Opus 的条件 | Codex 角色 |
|------|----------|---------------|-----------|
| CEO | Sonnet | 首单客户 · 单价 > $1000 · 章程歧义解读 | 章程写完后 Codex 独立审，抓隐藏倍增器 |
| PM | Sonnet | — | 工单拆分完 Codex 挑"是否漏环节" |
| Architect | **Opus**（默认） | 关键设计永远 Opus | design.md 写完 Codex 独立审架构 |
| Frontend/Backend Dev | Sonnet | 性能 / 算法 / 并发关键点 | 难点 pair programming；代码提交前 diff 过 Codex |
| Code Reviewer | Sonnet | — | **双盲**：Reviewer 独立审 + Codex 独立审 → 合议 |
| Security Reviewer | Sonnet | auth / 支付 / 加密相关 | **双盲**：必做 |
| Visual Reviewer / Doc / Archive | Haiku | — | 不用（机械活）|

**原则：** Opus 贵 5x Sonnet，只用在"错了代价高"的节点；Haiku 便宜 3x Sonnet，用在"错了容易发现"的节点。

## 二、Codex 双盲验证（全员必做的场景）

### 场景 A —— Architect 设计后

```
Opus 写 design.md v1
  ↓
调用 Ask-Codex："扮演独立架构师，审 E:\projects\<name>\doc\design.md，指出:
  1. 技术选型是否有更好候选
  2. 数据模型是否有遗漏字段
  3. API 契约是否有边界漏洞
  4. 安全/性能/可维护性隐患
  输出到 doc/design-review-codex.md"
  ↓
Opus 读 codex 报告，决定接受/拒绝/折中 → design.md v2
  ↓
若 Codex 报"CRITICAL" 而 Opus 不认同 → 升级 CEO 裁决
```

### 场景 B —— Dev 完成工单提交前

```
Dev (Sonnet) 写完 → self-check 通过
  ↓
调用 Ask-Codex："独立审 src/<改动文件>，列 HIGH+ 问题"
  ↓
Dev 读 codex 意见，改或拒绝（在工单 comment 留决策理由）
  ↓
status=done
```

### 场景 C —— Code/Security Reviewer 双盲

```
Reviewer (Sonnet) 独立审 → review-claude.md
Ask-Codex 独立审（不看 Claude 报告）→ review-codex.md
  ↓
Reviewer 合议：
  - 一致 PASS → 通过
  - 一致 CRITICAL → 必修
  - 分歧 → 升级 CEO 加 Opus 裁决（不用 Gemini）
```

## 三、Codex 调用规范

- **默认模型：`gpt-5.5`**（Codex CLI 实际支持的最新最强档；`mcp__Multi-CLI__List-Codex-Models` 是手工维护的列表会滞后，以 CLI 实际可用为准）
- 若 `gpt-5.5` 不可用 fallback 到 `gpt-5.4`
- 对异厂第二只眼的质量不打折 —— GPT 系列成本相对 Claude Opus 很低，值得用最强档
- prompt 中明确告诉 Codex：
  1. 它的角色（独立审查/结对/裁决）
  2. 要看的文件路径（Codex 有文件系统权限，自己 read）
  3. 输出格式（文件路径或结构化意见）
- **不直接给 Codex 贴代码**，让它自己 read，避免上下文撑爆

## 三·A、运行档位（profile，手动切换）

**当前运行档：`Turbo`（唯一启用档）**

其他档位保留定义，按需手动切换（目前不启用自动降档）：

| 档位 | CEO | PM | Architect | Dev | Reviewer | Codex 双审 | 适用场景 |
|------|-----|-----|-----------|-----|----------|-----------|---------|
| **Turbo** ✓ | Sonnet | Sonnet | **Opus** | Sonnet | Sonnet | gpt-5.5 | 默认，质量优先 |
| Night | Haiku | Haiku | Sonnet | Sonnet | Haiku | gpt-5.4 | 保留备用（未来无人值守用）|
| Cheap | Haiku | Haiku | Haiku | Haiku | Haiku | gpt-5.4-mini | 保留备用 |
| Off | — | — | — | — | — | — | 停机维护 |

**切档方式**：编辑本文件"当前运行档"一行。目前无自动切换逻辑；想切夜间自动降档，等未来开全自动时再做。

## 四、升级路径（谁裁决）

```
Sonnet vs Codex 分歧
  └→ Opus（Claude 4.7）裁决
       └→ 仍分歧 → CEO 人工决策（工单 comment 通知用户）
```

Gemini 暂不启用。

## 五、禁用场景（节省成本）

- Reviewer 对纯文档类工单（README、注释更新）**不触发 Codex 双盲**
- Dev 对"改 1-2 行小 bug"**不触发 Codex pair**
- Haiku 角色（Visual/Doc/Archive）永不调 Codex

## 六、成本护栏

- 单 MVP 预算 $2（超 50%)
- 单客户订单 / 卖价 > 0.5% 要 CEO 审批
- 日预算由 watcher 监控，详见 `governance/budget.md`
