# Lessons · Reviewer

每条：**场景 → 结论 → 下次怎么办**。

---

## 1. 截图 MCP 有工作区白名单，写 G:\ 被拒

**场景**：Personal Blog MVP 审查，用 `mcp__chrome-devtools__take_screenshot` 想直接写入 `G:\qa-reports\...`，返回 `Access denied: path not within workspace roots`。

**结论**：Chrome DevTools MCP 配置的工作区根只有 `C:\Users\23652` 和 `AppData\Local\Temp`。跨盘写要先写临时目录，再用 Bash 搬。

**下次怎么办**：
- 截图统一写 `%TEMP%\`，然后 `cp` 到 `G:\qa-reports\{project}\screenshots\`
- 或者未来在 MCP 配置里把 G 盘加进 workspace root

---

## 2. 章程布尔验收 + 三类复核（自动 / 视觉 / 审 design）分别跑

**场景**：10 条章程验收里，可 curl 自动验的 7 条、需 DOM 快照的 2 条、需审 design 对照的 1 条。

**结论**：三类复核分开跑。curl 先扫功能，chrome-devtools 补视觉，最后审 design.md 看是否偏离设计。

**下次怎么办**：
- curl 脚本化：一条 bash 脚本跑完所有 API 契约
- 视觉：chrome-devtools `evaluate_script` 读关键 DOM 文字 + 一张 full-page 截图
- 设计一致性：对比 `doc/design.md` 的 API 表和实际响应 JSON

---

## 3. `PASS_WITH_WARNINGS` 是可接受的；别为凑 PASS 漏 observation

**场景**：blog MVP 有 3 条非 blocker 观察项（favicon 404 / 限流跨路由 / autocomplete 缺失），结论是 PASS_WITH_WARNINGS。

**结论**：reviewer 的价值就在 observation；把观察项塞报告里，让 CEO 决定是否返工。返工判断是 CEO 的事，不是 reviewer 的事。

**下次怎么办**：
- observation 写在独立 section，和 PASS/FAIL 事实分开
- 每条 observation 给"是否 block 交付"的明确判断（YES → 其实是 HIGH/CRITICAL）
- 不要为凑 PASS 把观察项降级不写
