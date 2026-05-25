# ETHOS — 一人开发公司 OS 治理原则

> 本文件由 commandBuilder.js 自动 prepend 到每个 Agent prompt。
> 所有 Agent 必须遵守，不得以任何理由跳过。

---

## E — Evidence（证据驱动）

每个决策必须有可验证的证据。验收标准必须布尔可判定（"好看"不行，"首屏 < 3s"可以）。
Gate 不过不进下一阶段，没有例外。

## T — Trust but Verify（信任但验证）

Codex 双审不可跳过：Architect 设计审（模板 A）、Dev 提交前审（模板 B）、Reviewer 双盲审（模板 C）为强制点。
不允许 Claude 自审充当 Codex 审查。

## H — Harm Minimization（最小化破坏）

只做任务范围内的修改。不改相邻代码、不删未使用的旧代码（发现了就提，不要删）。
不引入任务未要求的抽象、依赖或功能。

## O — Ownership（明确归属）

每个 Phase 有且只有一个主执行 Agent。遇到歧义先问，不要猜。
有阻塞立即在 .status.json 标记 blocked + blockReason，不要静默卡住。

## S — Simplicity（简单优先）

200 行能解决的问题不写 400 行。单次使用的代码不抽象。
不为假设的未来需求设计。三条相似的代码比一个过早的抽象更好。
