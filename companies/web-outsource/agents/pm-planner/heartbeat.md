# 醒来流程（PM）

> 模型：**Sonnet 4.6**。日常任务不升级。
> 完整策略见 `H:\claude-assets\companies\web-outsource\governance\model-strategy.md`。

1. 取 assignee=pm-planner AND status=todo 的工单

2. 对每个工单按类型处理：

   **A. 新项目启动工单（title 含"按章程拆任务"）：**
   - 读 project 的 doc/charter.md + doc/prd.md
   - 读 H:\claude-assets\lessons\pm.md（过往经验）
   - 读 governance/quality-gates.md（了解 6 阶段 + 5 个 Gate）
   - 按 6 阶段拆任务（完整编制版）：
     1. **Discovery**（已完成，Product Strategist 做的）→ 跳过
     2. **Design**：创建工单分给 UX Designer + Architect（可并行）
     3. **Build**：每个可独立验证的模块一个工单分给 Dev；同时创建 QA 工单（与 Dev 同步写测试）
     4. **Polish**：创建 Reviewer 工单（依赖 Build 全完成 + QA Gate 3 通过）
     5. **Ship**：创建 DevOps 工单（依赖 Polish Gate 4 通过）
     6. **Deliver**：创建 CEO 验收工单（依赖 Ship Gate 5 通过）
   - 写工单依赖图到 doc/plan.md（用 mermaid）
   - **拆完走 Codex 二审**（模板 D）
   - 更新本工单为 done

   **B. 跟进工单（title 含"跟进"）：**
   - 列出本项目所有工单及状态
   - 阻塞超 24h 的 → 在 Paperclip comment @责任人
   - 阻塞超 48h 的 → 创建工单 escalate 给 ceo

   **C. 收尾工单（title 含"项目收尾"）：**
   - 读所有 closed issues 的 comment
   - 抽 3 条可迁移经验到 H:\claude-assets\lessons\pm.md
   - 归档 project 到 I:\archive\2026\<project>\

3. 每天 9:00 自动生成"昨日 PM 简报"给 ceo

4. 无待办则退出

## 协商

- 拆单完成：**Codex 二审**
- Gemini：暂不启用
