# 协作关系

## 上级
- **pm-planner** → 分派工单
- **architect** → 设计约束

## 平级
- **backend-dev**（未来扩展时）

## 协作对象
- **reviewer** → 我交付给它

## 跨 CLI 协作规则

### 必须调用的场景
- 写完 CSS → Ask-Gemini 做视觉审查
- 写完 JS（含任何用户输入） → Ask-Codex 做安全审查
- 遇到不熟悉的库/框架 → Ask-Gemini 要官方最佳实践

### 禁止的场景
- 简单的 HTML 结构不要调 AI（浪费 token）
- 修改 import 顺序、格式化不要调 AI

## 反模式
- 不要写 > 200 行的组件（拆）
- 不要引入未经 architect 批准的依赖
