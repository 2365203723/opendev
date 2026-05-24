# Codex 设计审查的高价值发现

**类型**：workflow  
**项目来源**：url-shortener（2026-05-12）  
**严重程度**：medium（流程改进建议）

## 问题描述

url-shortener 的设计审查由 Codex 独立完成，产出 8 条 HIGH 级建议和 8 条 NICE-TO-HAVE 建议。这些建议在设计阶段被采纳，避免了开发阶段的返工。

## 发现的问题类型

### HIGH 级（全部采纳）

| # | 问题 | 影响 | 采纳情况 |
|----|------|------|---------|
| H1 | `/:code` 路由缺少正则约束，会吞掉 `/favicon.ico` 等 | 功能性 bug | 改为 `/:code([a-z0-9]{6})` |
| H2 | HEAD 请求被默认路由到 GET，导致计数被污染 | 数据准确性 | 分别注册 HEAD 和 GET 路由 |
| H3 | 未知 API 路由会落到静态 handler，返回 HTML 而非 JSON | API 契约破裂 | 加 `/api` 404 兜底 |
| H4 | `createdAt` 格式不一致（SQLite 默认 vs ISO8601） | 前端渲染问题 | 改用 `strftime('%Y-%m-%dT%H:%M:%fZ','now')` |
| H5 | 前端 `originalUrl` 渲染缺少 XSS 防护说明 | 安全风险 | 明确要求 `textContent` 赋值 |
| H6 | URL 归一化边界不清（trim / 长度校验时机） | 数据一致性 | 补充 `validateAndNormalizeUrl` 详细规范 |
| H7 | 碰撞重试可能误捕 PK 冲突，导致无限循环 | 逻辑 bug | `id` 独立用 `crypto.randomUUID()`，重试仅捕 code UNIQUE |
| H8 | SQLite 并发写缺少 busy timeout | 可靠性 | 加 `PRAGMA busy_timeout = 5000` |

### NICE-TO-HAVE（部分采纳）

| # | 建议 | 采纳 | 理由 |
|----|------|------|------|
| N1 | 去掉冗余 `idx_links_code` | 是 | code UNIQUE 已自动建索引 |
| N2 | 加 CHECK 约束 | 是 | 数据库层防护，成本低 |
| N3 | `BASE_URL` 启动时剥离尾部 `/` | 是 | 避免 `http://x//abc123` |
| N4 | `GET /api/links` 分页 | 否 | YAGNI，小团队场景 |
| N5 | 短链 interstitial 警告页 | 否 | 已知边界，后续迭代 |
| N6 | SSRF 防护 | 否 | 当前无 URL 抓取功能 |
| N7 | 限流语义对齐 | 是 | 明确声明滑动窗口实现 |
| N8 | Windows `better-sqlite3` 预验 | 是 | 风险清单已覆盖 |

## 根因

Codex 审查的价值在于：

1. **独立视角**：不受 Architect 的设计思路束缚，从零审视
2. **规范库**：Codex 训练数据包含大量生产级代码，能识别常见陷阱
3. **细节覆盖**：路由顺序、HTTP 语义、并发问题等容易被忽视的细节

## 解决方案

**设计阶段的 Codex 审查流程**：

1. Architect 完成初稿设计（design.md）
2. 提交 Codex 审查（使用 `governance/codex-prompts.md` 的设计审查模板）
3. Codex 产出审查报告（CRITICAL / HIGH / NICE）
4. Architect 逐条评估，采纳或驳回，记录在设计文档附录
5. 设计定稿后才进入开发

**本项目的实际流程**：
- 设计初稿 → Codex 审查 → 8 条 HIGH 全采纳 → 设计 v2 定稿 → Dev 开工
- 结果：Dev 阶段无设计返工，只有 1 条 HIGH bug（escape-html）在代码审查阶段发现

## 预防规则

**Architect 检查清单**：
- [ ] 设计文档完成后，必须提交 Codex 审查（不是可选）
- [ ] 审查报告中的 CRITICAL 必须全部修复后才能进入开发
- [ ] HIGH 级建议应采纳，除非有明确的设计理由驳回（记录在文档中）
- [ ] NICE-TO-HAVE 可选，但应在文档中明确说明"采纳"或"延后"

**CEO 检查清单**：
- [ ] 设计审查是否完成（检查 `doc/design-review-codex.md` 是否存在）
- [ ] 是否有 CRITICAL 问题未修复（如有，不应进入开发）
- [ ] 设计文档是否记录了 Codex 建议的采纳情况（附录 B）

## 成本效益

| 阶段 | 成本 | 收益 |
|------|------|------|
| 设计审查 | ~$0.5（Codex 调用） | 避免 8 条 HIGH 级 bug 进入开发 |
| 开发返工 | ~$2（Dev 时间） | 如果 HIGH 问题在开发阶段发现 |
| **净收益** | | **$1.5 节省** |

## 相关经验

参考 `reviewer.md` 条 2：章程布尔验收 + 三类复核分别跑。本条是其上游：**设计阶段的 Codex 审查可以减少下游的审查和返工成本**。
