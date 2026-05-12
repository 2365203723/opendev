# Lessons · PM（项目经理）

每条：**场景 → 结论 → 下次怎么办**。

---

## 1. 章程布尔验收是全流程唯一事实依据

**场景**：Personal Blog MVP（WEB-20..27），CEO 在章程里写了 10 条布尔验收。Dev 自检、reviewer 审查、CEO 验收全部用同一份清单逐条比对。

**结论**：这是整个流水线最省事的机制。布尔条目（带具体动作：`刷新 2 次 views 增加`、`第 6 条返回 429`）消除歧义，每一环都不用二次翻译需求。

**下次怎么办**：
- 拆工单时让每个 dev 工单至少对应章程某几条
- 工单 description 里引用章程编号（如"满足 charter 条 5/6/7"）
- 不要把章程条目替换成工单自创验收标准

---

## 2. 单仓全栈 MVP，工单按"模块切"而非"前后端切"

**场景**：blog MVP 本可切"前端页面 / 后端 API"两线并行，但 frontend-dev 一人全栈，切成 4 个工单（骨架 / 留言 / 计数点赞 / 联系+README）反而更顺。

**结论**：**按验收条目归组** > 按技术层归组。一个工单内的工作应能独立跑通 curl/浏览器验证。

**下次怎么办**：
- Dev 一人时：按功能切（"留言功能"=前端表单+后端接口+DB 迁移一并做掉）
- Dev 多人时：按服务边界切（"comment-service" vs "like-service"）

---

## 3. 单架构师拍板"后台方案"一句话省半天

**场景**：客户勾了"博主管理后台"，我（PM）意识到会把 MVP 从 1h 涨到 3-4h，直接把决策权授给 architect。Architect 给了 2 句话理由选"文件版"，省掉 bcrypt/session/login 页面。

**结论**：PM 在客户勾选功能时，应主动识别"隐藏工作量倍增器"——登录/权限/审核流/邮件是典型的 3 个头。

## 4. Codex 二审能发现 CRITICAL，不是形式主义

**场景**：QuickShort URL 短链项目（WEB-44..51）。Architect 在 design.md v1 给了 URL 归一化公式 `protocol + hostname.toLowerCase() + pathname` —— 漏掉 port 和 userinfo。Codex gpt-5.5 二审作为 CRITICAL 报出，Architect 采纳，design.md v2 修复。

**结论**：**关键时刻 Opus + Codex 双盲**这个架构设计价值被验证。Opus 写完的设计自己看不出 bug，但 Codex 的异构视角 30 秒内抓到。

**下次怎么办**：
- Architect 交 design 前 **必做** Codex 二审，不得跳过
- Codex 报的 CRITICAL/HIGH 默认采纳；只有 Architect 能有充分理由拒绝（写在 design 附录）
- 在 heartbeat 里强制："Codex 二审未完成的 design 不允许交接给 Dev"

## 5. Codex 会超时，需要 fallback 策略

**场景**：QuickShort Reviewer 阶段 Codex 独立审 15 分钟后超时（Multi-CLI 底层错误）。Reviewer 没有明确的 fallback 规则，最终报 PASS_WITH_WARNINGS 并在报告中声明偏离。

**结论**：双盲机制需要容错。Codex 不可用不能卡住交付，但必须可追溯。

**下次怎么办**（建议纳入 heartbeat）：
- Codex 超时 → 立即重试 1 次（可能是瞬时）
- 仍超时 → 升级 CEO 决策（是单审放行 or 延期 or 换 gpt-5.4 降级）
- 无论哪种选择，审报告必须留"Codex 未双盲"声明段
- 交付后 Codex 可用时应补审，报告 v2 追溯
