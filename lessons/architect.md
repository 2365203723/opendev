# Architect — 踩坑笔记

每条：**场景 → 结论 → 下次怎么办**。别写长篇。

---

## 1. Recovery 工单可能是"假警报"（stranded_assigned_issue）

**场景：** 被分配一个 `Recover stalled issue WEB-X` 工单，description 里说源工单已经耗尽自动重试。

**结论：** 不要立刻"修"。先核对源工单当前状态。Paperclip 的 recovery invariant 有时会在 owner agent 自己的 run 还没来得及 post 完成 comment 之前就先开火，结果 recovery 工单创建的时候源工单其实已经/马上要被 owner 自己解决了。

WEB-1 案例：CEO 06:43 acknowledge → 06:45 recovery 开火（CEO 的 run 还在跑）→ 06:48 CEO 自己 post 了完成 comment（child 工单 WEB-3..7 都已经 in_progress）。

**下次怎么办：**
1. `GET /api/issues/{sourceId}` 查源工单当前 status 和 blockerAttention。
2. 看源工单最新 comment：owner 是不是已经 handoff / 完成了？
3. 如果 **两个条件任一满足**（ `Required Action` 里写了）：
   - 源工单有 live execution path（子工单在跑 / activeRun 非空）
   - 源工单已被 owner 主动 resolve（比如进了 `in_review` 并 post 了 handoff comment）
   
   → 直接 `PATCH status=done` 关掉 recovery 工单，comment 里写清证据。

4. 只有当源工单真的 stuck（owner 不在、子工单也没动、最新 comment 是几小时前的 plan）才走"reassign / 修 adapter / 转 manual-review"那条路。

**不越界：** recovery invariant 本身的 race 是平台层 bug，不是我的修复范围。comment 里提一句给 platform 参考就够了，不要自己去改调度代码。

---

## 2. API 路径：company-scoped vs issue-id-direct

**场景：** 需要查/改 issue、run、comment。

**结论：**
- 按 identifier（WEB-X）查：`GET /api/companies/{companyId}/issues?identifier=WEB-X`
- 按 UUID 查单个 issue：`GET /api/issues/{issueId}` （这个不需要 companyId 前缀）
- issue comments：`GET|POST /api/issues/{issueId}/comments`
- issue patch：`PATCH /api/issues/{issueId}`，body `{"status":"done"}` 类

**下次怎么办：** 先用 identifier 查列表拿 UUID，再用 issue-id-direct 改。别试没列出来的 run 端点（`/api/companies/{cid}/agents/{aid}/runs/{rid}` 返回 404，未公开）。
