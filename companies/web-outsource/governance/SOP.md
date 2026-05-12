# Web-Outsource 操作 SOP

> 版本：v2（2026-05-11 生效）
> 适用对象：公司老板（你本人）
> 目标：你只管"下需求"和"验收"，其它都靠系统和 10 个 agent

---

## 一、系统概览

```
你的输入                    系统                         你的输出
─────────                  ─────                        ─────────
客户原始材料    ──►  /intake（5 阶段漏斗）  ──►    requirements.md
"投了"         ──►  /go（6 阶段流水线）    ──►    浏览器验收
```

**10 人团队**：Product Strategist / UX Designer / CEO / PM / Architect / Frontend Dev / QA Engineer / Reviewer / DevOps / IntakeAnalyst

**6 阶段**：Discovery → Design → Build → Polish → Ship → Deliver

**5 个质量门**：每个阶段结束有硬指标，不过不进下一阶段

## 二、你的日常操作（只有 3 个动作）

### 动作 1：下单
```
/intake <客户名>
```
- 把客户材料扔 `E:\intake\<客户>\raw\`（微信截图、语音转文字、PPT、邮件，什么格式都行）
- 说 `/intake <客户名>`
- 回答 3-5 个选择题
- 看草稿，说"投了"
- 系统问"要不要启动流水线"→ 选"启动"

### 动作 2：启动流水线（如果没从 intake 直接启动）
```
/go <客户名>
```
- 系统自动跑 6 阶段
- 中间只在需要你决策时才问（Gate 1 签字、Gate 2 确认原型方向）
- 最终告诉你交付物路径

### 动作 3：验收
- 打开浏览器看交付物
- 满意 → 完成
- 不满意 → 告诉系统哪里不对，它会退回对应角色修

## 三、质量保证（你不用管但要知道）

| 阶段 | 质量门 | 硬指标 |
|------|--------|--------|
| Discovery → Design | Gate 1 | PRD 有 persona + 竞品 + MoSCoW + KPI + 布尔验收 |
| Design → Build | Gate 2 | 用户旅程 + 设计令牌 + 技术方案 + Codex 审 + 你确认原型 |
| Build → Polish | Gate 3 | 测试覆盖 ≥ 80% + E2E ≥ 3 + lint 0 + Codex 审 PASS |
| Polish → Ship | Gate 4 | Lighthouse ≥ 90 + WCAG AA + 设计一致 + Codex 双盲 PASS |
| Ship → Deliver | Gate 5 | Docker 可构建 + /health 200 + 回滚方案 |

## 四、管理操作

### 服务管理
- 开机自启已注册（`install-autostart.cmd`）
- 停服务：`schtasks /End /TN paperclip-watcher && schtasks /End /TN paperclip-backend`
- 启服务：`schtasks /Run /TN paperclip-backend && schtasks /Run /TN paperclip-watcher`

### 全自动开关
- 查看：`E:\cmd\check-fullauto.cmd`
- 开启：`E:\cmd\enable-fullauto.cmd`（需升级 watcher v2）
- 关闭：`E:\cmd\disable-fullauto.cmd`

### 预算
- 日限 $10 / 周限 $50（`H:\paperclip\watcher\config.json`）
- 超限自动 pause + 通知

### 模型档位
- 当前：Turbo（Opus 关键 + Sonnet 日常 + Codex gpt-5.5 双审）
- 切档：改 `governance/model-strategy.md` 的 currentProfile

## 五、排障

| 症状 | 做法 |
|------|------|
| /go 卡在某个 Gate | 看它说"哪里不通过"，通常是文件缺失或测试失败 |
| Codex 超时 | 系统会自动重试 1 次 → 降级 gpt-5.4 → 声明偏离继续 |
| 循环返工 > 3 次 | 系统会停下报告根因，你决定是改需求还是降标准 |
| Paperclip 3100 没响应 | daemon 会 30s 内自动重启；手动：`schtasks /Run /TN paperclip-backend` |

## 六、禁忌

- ❌ 不要手动改 Paperclip 工单状态
- ❌ 不要跳过 /intake 直接在 Claude 里说需求（走 inbox）
- ❌ 不要在项目 src/ 下手动改代码（走变更请求）
- ❌ 不要跳过质量门（Gate 不过就是不过）
- ❌ 不要在 Gate 4 之前交付给客户

---

## 二、半自动 vs 全自动（当前：半自动）

**半自动**：
- watcher 自动派发工单、记账、护栏
- agent 实际"干活"需要你打开 Claude Code 说一句 `处理新工单`
- 不烧空转 token；你在电脑前时效率最高

**全自动**（未启用）：
- watcher 看到 trigger 文件会自动 `claude -p` spawn 一次 headless 会话跑完该 agent 一轮
- 真正无人值守；风险：循环返工烧钱 → 必须硬上限保护
- **默认关闭**，切换方法：`E:\cmd\enable-fullauto.cmd`（未来要用再给你写）

---

## 三、日常使用 SOP

### 场景 A：下一个新订单（90% 场景）

**现实：客户的输入 90% 不规范**。用 **Intake 流程**先清洗：

**路径 A1：客户给了混乱输入（微信/语音转文字/PPT）→ 推荐走 intake**
1. 在 `E:\intake\<客户>\raw\` 下把所有材料（任何格式）丢进去
2. 打开 Claude Code
3. 说 `/intake <客户名>`（或 `开 intake <客户名>`）
4. IntakeAnalyst 会走 5 阶段漏斗：
   - 阶段 1 读所有材料，抽事实到 `work/facts.md`
   - 阶段 2 识别缺口到 `work/gaps.md`
   - 阶段 3 生成 < 10 个选择题 **用 AskUserQuestion 直接问你**
   - 阶段 4 出 `work/draft-requirements.md` 含假设清单
   - 阶段 5 自检后请你确认
5. 你说 **"投了"** → 自动 cp 到 `E:\inbox\<客户>\requirements.md`
6. Watcher 30 秒内派单给 CEO（和原流程对接上）

**路径 A2：你自己已经很清楚需求 → 直接写 requirements.md 扔 inbox**
1. 在 `E:\inbox\<客户>\requirements.md` 直接写（参考 `H:\claude-assets\companies\web-outsource\templates\requirements.template.md`）
2. 扔进去，Watcher 派单，同旧流程

**判断用 A1 还是 A2 的标准**：
- 能一次写出 10 条布尔验收标准 → 用 A2
- 写到第 5 条就卡住 / 写完觉得有相对词太多 → 用 A1

**系统会在 30 秒内**：
- Watcher 检测到 requirements.md → 创建 `[inbox]` 工单分给 CEO
- 写 trigger 文件到 `E:\cmd\triggers\`

**启动流水线**：
- 如果你从 `/intake` 投递的：它会直接问你"要不要启动"，选"启动"就行
- 如果你手动扔的 inbox：说 `/go`（或 `/go <客户名>`）
- 流水线会自动按 CEO→PM→Architect→Dev→Reviewer→CEO 跑完
- 中间只有需要你决策的点才会问你（验收标准确认、预算超限等）

**你什么时候需要再开口**：
- CEO 问你验收问题时
- Reviewer 给出 PASS_WITH_WARNINGS，CEO 问你接不接受
- 全流程都 PASS → 打开浏览器访问交付物

### 场景 B：追加需求 / 改动

需求确认过后想加东西？**不要直接在 Claude 里说**。做法：
1. 在 `E:\projects\<客户>\doc\change-requests\` 建文件，如 `cr-001-add-search.md`
2. 写清楚：要改什么、为什么、验收标准
3. 打开 Claude Code，说 `acme-corp 有变更请求`
4. CEO 会走"变更评估"流程：成本 / 风险 / 是否影响已交付 → 审批

### 场景 C：看系统健康

日常不用看，真要看：
```powershell
# 服务健康
curl http://127.0.0.1:3100/

# Watcher 日志
Get-Content G:\logs\watcher\watcher-$(Get-Date -f yyyyMMdd).log -Tail 20

# Paperclip 工单列表
start http://127.0.0.1:3100/
```

### 场景 D：查账

看本周 / 本月花了多少：
```
http://127.0.0.1:3100/ → 你的公司 → Costs
```

超预算 watcher 会自动 pause + 在 inbox 留 `[ALERT] budget-exceeded.md`，你看到就说 `CEO 查预算告警`。

---

## 四、管理 SOP

### 开机自启
- 已注册 Scheduled Task `paperclip-backend` + `paperclip-watcher`
- 每次 Windows 登录自动起
- 崩溃自动重启
- 黑窗隐藏

**未启用过**？一次性注册：管理员权限运行 `H:\paperclip\watcher\install-autostart.cmd`

### 停服务（临时）
```cmd
schtasks /End /TN paperclip-watcher
schtasks /End /TN paperclip-backend
```

### 开服务（不重启）
```cmd
schtasks /Run /TN paperclip-backend
schtasks /Run /TN paperclip-watcher
```

### 彻底卸载开机自启
管理员运行 `H:\paperclip\watcher\uninstall-autostart.cmd`（仅停自启，不删数据）

### 切运行档
编辑 `H:\claude-assets\companies\web-outsource\governance\model-strategy.md` 第三·A 节：
- `currentProfile: Turbo` → 质量优先
- `currentProfile: Night` → 省钱
- `currentProfile: Cheap` → 极限省（仅演示）
- `currentProfile: Off` → 全员拒接

改完下次 agent 心跳自动读取新档。

### 预算
`H:\paperclip\watcher\config.json`：
- `dailyBudgetUSD`（默认 10）
- `weeklyBudgetUSD`（默认 50）
超了 watcher 自动 pause + 通知 CEO。

---

## 五、排障 SOP

### 症状：watcher 没响应

```powershell
schtasks /Query /TN paperclip-watcher
```
- `Running` → 看日志 `G:\logs\watcher\watcher-*.log` 找错
- `Ready` → `schtasks /Run /TN paperclip-watcher`

### 症状：Paperclip API 3100 端口没起

```powershell
curl http://127.0.0.1:3100/
```
- 无响应 → `schtasks /Run /TN paperclip-backend`
- 仍无 → 看 `G:\logs\paperclip\startup.log`

### 症状：agent 看似在跑但卡住

1. 打开 http://127.0.0.1:3100/ 看工单状态
2. 某工单卡 `in_progress` > 30min → 在 Claude 说 `<工单号> 看着卡住了，查一下`

### 症状：Reviewer 反复 FAIL，Dev 反复重做

- 这是**循环返工保护触发前的表现**
- 在 Claude 说 `<项目名> 进入循环了，帮我拉起 Opus 看看根因`
- Opus 会读两份审报告，决定"真有问题 vs reviewer 误判"

### 症状：Codex 调用失败

1. `mcp__Multi-CLI__List-Codex-Models` 查当前可用模型
2. 配额用光 / 模型下线 → 在 `model-strategy.md` 临时改为 `gpt-5.3-codex` 或跳过 Codex 审

### 症状：截图没到 G 盘

- Chrome MCP 只能写 `C:\Users\23652\AppData\Local\Temp\qa-*.png`（文件名必须以 `qa-` 开头）
- Watcher 30s 内自动搬到 `G:\qa-reports\_inbox\screenshots\`
- 没到 → 看 watcher 日志 `🖼 relayed` 条目；若没有这条说明文件名没以 `qa-` 开头或 watcher 挂了

---

## 六、升级 / 退档 SOP

### 想上全自动

条件：已顺跑 3 单、预算充足、信任系统

**当前：半自动运行中**。开关已封装好在 `E:\cmd\`：

| 按钮 | 作用 |
|------|------|
| `E:\cmd\check-fullauto.cmd` | 查看当前模式 |
| `E:\cmd\enable-fullauto.cmd` | 开启全自动 |
| `E:\cmd\disable-fullauto.cmd` | 关闭全自动（回半自动）|

**开启步骤**：
1. 双击 `enable-fullauto.cmd`，输入 `yes` 确认
2. 脚本会检测 watcher 是否支持全自动执行（当前版本不支持，需升级到 v2）
3. 如果 watcher 还是 v1：告诉我"升级 watcher 到全自动 v2"，我会加 `Spawn-Claude` 函数 + 唤醒上限保护
4. 升级完双击 `enable-fullauto.cmd` 正式生效

**重要护栏**（写在 config.json）：
- `fullAutoMaxWakeupsPerProjectPerDay: 15`（单项目 24h 内最多 15 次 agent 唤醒，防循环返工烧钱）
- `fullAutoSafetyPaused`（watcher 触发异常时自动设 true 暂停）

**想关回半自动**：双击 `disable-fullauto.cmd` 立即生效

### 想加新角色（后端 / 测试 / 文档）

在 Claude 会话说：
```
CEO，我要招聘一个 backend-dev
职责：...
预算：...
```
CEO 会走审批 → 在 `H:\claude-assets\companies\web-outsource\agents\` 下创建四件套（soul/heartbeat/agents/tools）→ 申请 Paperclip agent UUID → 加入 watcher 配置

### 想换新公司 / 新业务线

创建 `H:\claude-assets\companies\<new-company>\` 整套目录。watcher `config.json` 可以多公司同开。

---

## 七、给客户汇报的 SOP

当你要向客户展示交付时：
1. 打开浏览器访问 `http://localhost:3000`（或项目实际端口）
2. 把交付材料包打包（下列是标准包）：
   - 源码：`E:\projects\<客户>\src\`
   - 文档：`E:\projects\<客户>\doc\charter.md` + `design.md` + `README`
   - 审查报告：`G:\qa-reports\<客户>\review-*.md`（选最新）
   - 截图：`G:\qa-reports\<客户>\screenshots\`
3. 用 `officecli` skill 生成客户版 PPT（一键）

---

## 八、MVP 博客是参考样板

你做的第一个项目 `personal-blog` 保留在：
- 源码：`E:\projects\personal-blog\src\`
- 文档：`E:\projects\personal-blog\doc\{charter,plan,design,acceptance}.md`
- 审查：`G:\qa-reports\personal-blog\review-001.md`

每次下新订单前**扫一眼这个目录结构**，心里就有底：新项目会长什么样、我会看到什么。

---

## 九、禁忌清单

- ❌ **不要**手动编辑 Paperclip 工单状态（用 agent 改）
- ❌ **不要**直接把需求贴 Claude 会话（走 inbox）
- ❌ **不要**跳过 Codex 双审（会漏 bug）
- ❌ **不要**在项目 src/ 下手动改代码（走变更请求）
- ❌ **不要**在 Night 档下交付高单价订单（质量可能不够）
- ❌ **不要**把 Gemini 塞回来（统一异厂第二只眼就够）

---

## 十、下一步建议

按这个顺序体验：
1. **第一单**：随便找个小需求（朋友要改的 landing page）走一遍，熟悉节奏
2. **第二单**：带简单后端的（表单 + 邮件通知），验证 Dev 复杂度
3. **第三单**：真客户单，小心算预算
4. 跑顺之后 → 申请全自动升级

**一句话总结这份 SOP**：
> 把需求扔 inbox，CEO 接单，其他自动；有问题系统会找你，没事系统不烦你，你只看最终交付。
