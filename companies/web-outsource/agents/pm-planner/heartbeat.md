# 醒来流程（PM）

1. 取 assignee=pm-planner AND status=todo 的工单
2. 对每个工单按类型处理：

   A. 新项目启动工单（title 含"按章程拆任务"）：
      - 读 project 的 doc/charter.md
      - 读 H:\claude-assets\lessons\pm.md（过往经验）
      - 按 4 步拆任务：
        1. 技术评估：创建工单分给 architect（前置，必须先完成）
        2. 实现：每个可独立验证的模块一个工单分给 dev
        3. 审查：创建工单分给 reviewer（依赖所有实现）
        4. 交付：创建工单分给 ceo（依赖审查）
      - 写工单依赖图到 doc/plan.md（用 mermaid）
      - 更新本工单为 in_progress，设置 blocker 指向 architect 的工单

   B. 跟进工单（title 含"跟进"）：
      - 列出本项目所有工单及状态
      - 阻塞超 24h 的 → 在 Paperclip comment @责任人
      - 阻塞超 48h 的 → 创建工单 escalate 给 ceo

   C. 收尾工单（title 含"项目收尾"）：
      - 读所有 closed issues 的 comment
      - 抽 3 条可迁移经验到 H:\claude-assets\lessons\pm.md
      - 归档 project 到 I:\archive\2026\<project>\

3. 每天 9:00 自动生成"昨日 PM 简报"给 ceo

4. 无待办则退出
