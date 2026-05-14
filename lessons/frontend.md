# Lessons · Frontend Dev

每条：**场景 → 结论 → 下次怎么办**。

---

## 1. 限流用进程内存 Map + IP 共用桶，MVP 阶段够用

**场景**：blog MVP 限流要求"每 IP 每分钟 ≤ 5 条留言"。实现用 `Map<ip, number[]>` + 时间戳过滤，<25 行代码。

**结论**：比 `express-rate-limit` 多装一个依赖换 20 行代码不值。但跨路由共用桶会让 reviewer 提观察项。

**下次怎么办**：
- MVP：内存 Map + 共用桶，在 design.md 声明"暂不按路由分"
- 多进程部署：必换 Redis/cluster-aware 方案
- 若客户 7×24 场景：初版就分路由分桶，避免联系表单被留言请求挤占

---

## 2. better-sqlite3 同步 API + `INSERT OR IGNORE` seed 是 Windows 最省心

**场景**：需要把 posts.json 的 seed 文章同步进 DB，同时不覆盖运行时累计的 views。

**结论**：`better-sqlite3` 同步写 + `INSERT OR IGNORE` 一条语句搞定，启动即 seed，不需要 migration 工具。

**下次怎么办**：
- 种子数据少且静态：用 `INSERT OR IGNORE` + JSON 文件
- 种子数据需要版本化：换成 `migrations/` 目录 + `knex` 或手写 schema_version 表

---

## 3. 前端防 XSS 用 `textContent` 比前端净化库更轻

**场景**：留言内容已在服务端用 `escape-html` 转义入库。前端渲染时有两个选择：`innerHTML` + 信任 / 用 `DOMPurify` / 用 `textContent`。

**结论**：`textContent` 是零依赖、零代码的双保险。服务端可能忘记转义，前端兜住。

**下次怎么办**：
- 纯文本内容：一律 `textContent`
- 需要富文本（Markdown）：才上 `DOMPurify`，且对 innerHTML 目标节点做
- 别把 `innerText` 跟 `textContent` 混用（前者会触发 reflow）
