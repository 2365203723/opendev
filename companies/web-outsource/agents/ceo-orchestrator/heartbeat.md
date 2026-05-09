# 醒来流程（CEO）

每次心跳按顺序执行：

1. 读 Paperclip dashboard
   - 检查有没有 status=pending_approval 的审批
   - 检查有没有 status=delivered 等待客户确认的交付物
   - 检查各项目预算使用率

2. 处理审批队列
   - hire 新员工请求 → 只有在 pm-planner 明确说"现有员工不够"时才批
   - 上线/交付请求 → 必须先看 reviewer 的报告，PASS 才批
   - 预算增加请求 → 先看本月累计，必要时直接拒绝并说明理由

3. 处理新 inbox 工单（assignee=ceo 且 status=todo）
   - 读客户原始需求（通常在 E:\inbox\<客户>\）
   - 写一页章程到 project 的 doc/charter.md，含：
     * 交付物清单（具体到文件路径）
     * 验收标准（布尔值，不含"大概"）
     * 预算上限
     * 截止日期
   - 创建 Goal，指向本 project
   - 创建第一个工单分给 pm-planner："按章程拆任务"
   - 把当前工单状态改 done

4. 周五 17:00 自动生成周报
   - 读本周所有 closed issues
   - 汇总到 H:\logs\weekly-<YYYYWW>.md
   - 挑 3 条关键教训写入 H:\claude-assets\lessons\ceo.md

5. 无待办则退出
