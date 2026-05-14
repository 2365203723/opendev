# 经验库索引

> 自动生成，每次新增经验后更新
> Agent 启动时 grep 此文件找相关经验，再 Read 具体文件

## 按角色

| 文件 | 关键词 |
|------|--------|
| architect.md | 技术选型, 数据模型, API设计, 骨架复用, 性能 |
| frontend.md | XSS, escape-html, 路由顺序, 状态管理, 响应式, 无障碍 |
| backend.md | SQL注入, 认证, 限流, 内存泄漏, 并发, migration |
| reviewer.md | 双盲, Codex分歧, 安全审查, 视觉回归 |
| pm.md | 拆单, 依赖图, 阻塞处理, 工时估算 |
| intake.md | 客户沟通, 布尔化, 需求歧义, 行业术语 |
| qa.md | 覆盖率, E2E, 对抗测试, 边界用例 |
| security.md | OWASP, 渗透, CSP, CORS, 认证绕过 |
| devops.md | Docker, 健康检查, 回滚, CI, 监控 |

## 按主题

| 文件 | 日期 | 主题 | 关键词 |
|------|------|------|--------|
| 20260512-escape-html-url-bug.md | 2026-05-12 | escape-html bug | XSS, URL编码, &符号, 转义 |
| 20260512-skeleton-reuse-effect.md | 2026-05-12 | 骨架复用效果 | 骨架, 模板, 节省时间 |
| 20260512-codex-design-review-value.md | 2026-05-12 | Codex设计审查价值 | Codex, 双盲, 架构审查 |
| 20260512-memory-map-leak.md | 2026-05-12 | 内存泄漏 | Map, 内存, 泄漏, 清理 |
| 20260512-route-order-trap.md | 2026-05-12 | 路由顺序陷阱 | Express, 路由, 顺序, 404 |

## 使用方法

Agent 启动时：
1. `grep -i "<关键词>" H:\claude-assets\lessons\INDEX.md`
2. 找到相关文件后 `Read H:\claude-assets\lessons\<file>.md`
3. 完成后如有新经验，更新对应角色文件 + 更新此索引

## 写入规则

**所有 agent 收尾时必须检查是否有新经验可写入。** 标准：
- 踩了坑且修复方式非显而易见 → 写
- 发现了可复用的 pattern（≥2 次出现）→ 写
- Codex 指出了自己没想到的问题 → 写
- 格式：一条经验 = 一段话（场景 + 问题 + 解法 + 教训）
- 文件不存在时创建（如 `lessons/security.md`、`lessons/frontend.md`、`lessons/backend.md`）
