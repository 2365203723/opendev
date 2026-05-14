# 模型策略（公司级，2026-05-14 生效）

> 公司：web-outsource
> 修订人：CEO
> 适用范围：所有子代理调用

---

## 一、模型分配（固定，不动态升降级）

每个子代理在它的定义文件 `C:\Users\23652\.claude\agents\<role>.md` 的 frontmatter 里固定一个模型。父代理通过 Agent tool 调用时使用该模型。

| 子代理 | 模型 | 理由 |
|-------|------|------|
| ceo | sonnet | 决策类，不需要 opus 推理深度 |
| pm-planner | sonnet | 拆分任务模式化 |
| product-strategist | sonnet | 调研+整理，sonnet 够 |
| ux-designer | sonnet | 视觉/结构 |
| **architect** | **opus** | 架构决策错代价最高 |
| frontend | sonnet | 实现类，按 design 执行 |
| backend | sonnet | 实现类，按 design 执行 |
| qa-engineer | sonnet | 测试模板化 |
| security-engineer | sonnet | 安全审计需推理但不需 opus |
| reviewer | sonnet | 独立审 + Codex 双盲已保证质量 |
| **devops** | **haiku** | Dockerfile/compose 高度模板化 |
| intake-analyst | sonnet | 与用户交互问问题 |

**原则**：
- Opus 贵 5x Sonnet，只用在"错了代价高"的节点（架构）
- Haiku 便宜 3x Sonnet，用在"错了容易发现"的节点（运维、汇总）
- 其他角色一律 Sonnet

## 二、为什么不动态升降级

之前的方案有"首单升 opus"、"auth 升 opus"、"夜间 cheap 档"等动态规则——实际运行时：

1. 父代理判断不准（不知道是不是首单）
2. 子代理读 frontmatter 的 model 字段，外部规则改不动
3. 增加心智负担，用户搞不清这单到底花了多少钱

固定模型的好处：
- 每单成本可预测
- 调试简单（出问题一眼看出是哪个模型不行）
- 子代理定义文件就是单一真相源

## 三、Codex 强制 gpt-5.5-codex

详见 `codex-prompts.md`。不降级、不跳过、不让 Claude 自审充当 Codex。

## 四、如果某个 Phase 需要更强模型

不要改 model-strategy.md，而是：

1. **临时**：父代理调 Agent tool 时显式传 `model: "opus"` 覆盖默认
   ```
   Agent({ subagent_type: "backend", model: "opus", prompt: "...性能算法关键..." })
   ```

2. **永久**：编辑该子代理定义文件 frontmatter 的 model 字段

## 五、不再使用 Gemini

理由：
- Codex 双盲已经覆盖"异厂第二只眼"的需求
- 多一家供应商 = 多一个失败模式
- Gemini 在 web 后端审查上的精度低于 Codex
