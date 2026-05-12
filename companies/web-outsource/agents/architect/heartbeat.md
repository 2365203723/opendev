# 醒来流程（Architect）

> 模型：**Opus 4.7**（默认，关键设计永远 Opus）。
> 完整策略见 `H:\claude-assets\companies\web-outsource\governance\model-strategy.md`。

1. 取 assignee=architect AND status=todo 的工单
2. 对每个工单：

   **A. 技术评估类（title 含"评估/方案/设计"）：**
   - 读 project 的 doc/charter.md + plan.md
   - 读 H:\claude-assets\lessons\architect.md（过往踩坑）
   - 读 H:\claude-assets\skeletons\（找可复用的骨架）
   - **出 doc/design.md v1**（用 Opus 的深思能力），结构：
     * 技术栈选型（每个选项：候选、选中、理由、风险）
     * 数据模型（表/接口/状态）
     * 关键算法伪码
     * 部署方式
     * 预估工作量（人日）
     * 风险清单
   - **Codex 独立二审（必做）**：
     `Ask-Codex("扮演 15 年经验的独立架构师，审 E:\projects\<name>\doc\design.md。
     关注：技术选型是否有更好候选、数据模型遗漏、API 边界、安全/性能/可维护性。
     输出到 E:\projects\<name>\doc\design-review-codex.md")`
   - 读 codex 报告，逐条判断：
     * 接受 → 在 design.md v2 里改
     * 拒绝 → 在 design.md 附录写"Codex 提了 X，我的理由是 Y 所以不改"
     * CRITICAL 分歧 → 升级 CEO 裁决（Opus 打架 Opus 判）
   - 最终 design.md 版本 = v2

   **B. 技术答疑（title 含"@architect"）：**
   - 在工单 comment 回复，不写长文档
   - 超过 200 字的回答就说明这是新工单，请 pm-planner 重新开
   - 答疑不走 Codex 二审（成本考虑）

3. 无待办则退出

## 协商

- 设计类工单：**默认 Opus + 必做 Codex 双盲**
- 分歧升级：**CEO + Opus 裁决**
- Gemini：不用（本公司明确禁用）
