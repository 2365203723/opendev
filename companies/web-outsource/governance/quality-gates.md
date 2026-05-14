# 质量门标准（Quality Gates）

> 版本：v2（2026-05-11 生效）
> 适用：所有项目（MVP 和正式单共用，但 MVP 可降级标注）
> 原则：**不过门不进下一阶段。没有例外。**

---

## 总览

```
Discovery ──[Gate 1]──► Design ──[Gate 2]──► Build ──[Gate 3]──► Polish ──[Gate 4]──► Ship ──[Gate 5]──► Measure
```

---

## Gate 1：Discovery → Design（产品方向确认）

**谁负责**：Product Strategist 产出 → CEO 签字

| # | 检查项 | 标准 | 验证方式 |
|---|--------|------|----------|
| 1 | PRD 存在 | `doc/prd.md` 落盘 | 文件存在 |
| 2 | 用户画像 | ≥ 1 个 persona 有名字、痛点、目标 | PRD 第二节 |
| 3 | 竞品分析 | ≥ 2 个竞品，各列优劣 | PRD 第三节 |
| 4 | 功能优先级 | MoSCoW 分类（Must/Should/Could/Won't） | PRD 第四节 |
| 5 | 成功指标 | ≥ 2 个可量化 KPI（如"注册转化率 > 30%"） | PRD 第五节 |
| 6 | 验收标准 | 全布尔，≥ 10 条 | PRD 第六节 |
| 7 | CEO 签字 | charter.md 引用 PRD 并标"批准" | charter.md 存在 |

**不过门的后果**：Design 阶段不启动。PM 不拆单。

---

## Gate 2：Design → Build（设计冻结）

**谁负责**：UX Designer + Architect 产出 → Codex 双审 → CEO 确认

| # | 检查项 | 标准 | 验证方式 |
|---|--------|------|----------|
| 1 | 用户旅程图 | `doc/ux/user-journey.md` 覆盖核心流程 | 文件存在 + 步骤 ≥ 5 |
| 2 | 信息架构 | `doc/ux/sitemap.md` 列出所有页面/状态 | 文件存在 |
| 3 | 交互规范 | `doc/ux/interaction-spec.md` 每个关键交互有描述 | 文件存在 |
| 4 | 设计令牌 | `doc/ux/design-tokens.md`（色板/字体/间距/圆角/阴影） | 文件存在 + ≥ 5 类令牌 |
| 5 | 技术方案 | `doc/design.md` v2（经 Codex 二审） | 文件存在 |
| 6 | ADR | `doc/adr/` 下 ≥ 1 个架构决策记录 | 文件存在 |
| 7 | Codex 设计审 | `doc/design-review-codex.md` verdict ≠ BLOCK | 文件存在 + APPROVE/APPROVE_WITH_NOTES |
| 8 | 原型验证 | 老板看过交互原型（HTML 或截图）并确认 | 工单 comment 有老板确认 |

**不过门的后果**：Dev 不开工。任何代码提交被 Reviewer 退回。

---

## Gate 3：Build → Polish（功能完成）

**谁负责**：Dev 产出 → QA Engineer 验证 → Codex 双审

| # | 检查项 | 标准 | 验证方式 |
|---|--------|------|----------|
| 1 | 所有 Must-have 功能实现 | PRD MoSCoW 的 M 全部 done | 工单状态 |
| 2 | 测试覆盖率 | ≥ 80%（unit + integration） | `npm test -- --coverage` 输出 |
| 3 | E2E 测试 | 核心用户旅程 ≥ 3 条 Playwright 测试通过 | `npx playwright test` 绿 |
| 4 | Lint 零错误 | ESLint/Prettier 0 error 0 warning | `npm run lint` 退出码 0 |
| 5 | 类型安全 | TypeScript strict 或 JSDoc 覆盖公共 API | `tsc --noEmit` 通过（如用 TS）|
| 6 | Codex 代码审 | 0 CRITICAL + 0 HIGH 未处理 | review-codex.md verdict |
| 7 | 安全基线 | `npm audit` 无 high/critical | 命令输出 |
| 8 | 数据库迁移 | schema 变更有 migration 脚本 | `migrations/` 目录或 init 脚本 |
| 9 | API 文档 | 所有端点有请求/响应示例 | README 或 OpenAPI spec |
| 10 | 启动验证 | `npm run dev` + 全部验收标准 curl 通过 | 自检脚本输出 |

**不过门的后果**：不进 Polish。Reviewer 不接单。

---

## Gate 4：Polish → Ship（生产就绪）

**谁负责**：QA + UX + Reviewer 联合验证

| # | 检查项 | 标准 | 验证方式 |
|---|--------|------|----------|
| 1 | Lighthouse Performance | ≥ 90（桌面） | Chrome DevTools MCP |
| 2 | Lighthouse Accessibility | ≥ 95 | Chrome DevTools MCP |
| 3 | Lighthouse Best Practices | ≥ 95 | Chrome DevTools MCP |
| 4 | WCAG 2.1 AA | 0 违规（axe-core 扫描） | `npx axe` 或 Lighthouse |
| 5 | 设计令牌一致性 | 所有颜色/字体/间距来自 design-tokens.md | UX 视觉审查 |
| 6 | 响应式（如要求） | 375px / 768px / 1440px 三断点无破版 | 截图对比 |
| 7 | 错误状态 | 所有表单/API 调用有错误提示 | 手动触发 |
| 8 | 空状态 | 列表为空时有友好提示 | 清空数据验证 |
| 9 | 加载状态 | 异步操作有 loading 指示 | 节流网络验证 |
| 10 | Codex 最终审 | 双盲合议 PASS | review-001.md |
| 11 | 安全渗透 | OWASP Top 10 逐项检查 PASS | security-review.md |
| 12 | README 完整 | 启动/部署/API/架构/已知问题/贡献指南 | 文件审查 |

**不过门的后果**：不部署。不交付。

---

## Gate 5：Ship → Measure（上线确认）

**谁负责**：DevOps 部署 → CEO 最终签字

| # | 检查项 | 标准 | 验证方式 |
|---|--------|------|----------|
| 1 | Dockerfile 存在 | 可 `docker build` 成功 | 构建通过 |
| 2 | 健康检查 | `/health` 端点返回 200 | curl |
| 3 | 环境变量文档 | `.env.example` 列出所有必需变量 | 文件存在 |
| 4 | 回滚方案 | 文档化的回滚步骤 | `doc/ops/rollback.md` |
| 5 | 监控就绪 | 日志结构化 + 错误告警配置 | 配置文件存在 |
| 6 | 验收标准全过 | charter.md 每条 PASS | acceptance.md 10/10 |

---

## 复杂度降级矩阵

| complexity | Gate 1 | Gate 2 | Gate 3 | Gate 4 | Gate 5 |
|---|---|---|---|---|---|
| tiny | **跳过**（无 PRD） | 跳过 UX 4 项，只查 design.md + Codex 审 | 正常 | 正常 | 正常 |
| small | 只查 charter ≥10 条验收 + CEO 签字 | 正常 | 正常 | 正常 | 正常 |
| medium | 正常 | 正常 | 正常 | 正常 | 正常 |
| large | 正常 | 正常 | 正常 | 正常 | 正常 |

charter.md 第二行必须声明 `mvp: true|false`。QA/Reviewer 读此字段决定是否应用 MVP 降级阈值。

---

## MVP 降级规则

对于 MVP / 系统测试 / 预算 < $500 的项目（charter.md 标注 `mvp: true`），以下门可降级：

| Gate | 可降级项 | 降级为 |
|------|---------|--------|
| Gate 1 | 竞品分析 | 可省略（标注"MVP 跳过"）|
| Gate 2 | 原型验证 | 可用文字描述代替 HTML 原型 |
| Gate 3 | 测试覆盖率 | 降到 ≥ 60% |
| Gate 4 | Lighthouse | 降到 ≥ 80 |
| Gate 4 | 响应式 | 可不做（标注"桌面 only"）|
| Gate 5 | Docker | 可不做（本地 npm run dev 即可）|

**降级必须在 charter.md 里明确标注**，不能静默跳过。

---

## 质量门执行者

| Gate | 主执行 | 辅助 | 签字 |
|------|--------|------|------|
| 1 | Product Strategist | — | CEO |
| 2 | UX + Architect | Codex | CEO |
| 3 | QA Engineer | Codex | Architect |
| 4 | QA + Security Engineer + Reviewer | Codex | CEO |
| 5 | DevOps | — | CEO |
