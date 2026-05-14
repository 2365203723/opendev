# Skeletons — 可复用项目骨架

## 用法

```powershell
# 初始化项目时指定骨架
H:\claude-assets\companies\web-outsource\governance\init-project.ps1 -Name myproject -Skeleton express-sqlite-spa
```

骨架内容会被复制到 `E:\projects\<name>\` 下。

## 可用骨架

### express-sqlite-spa

Express + SQLite + 单页应用模板。适用于 tiny/small 项目。

**包含：**
- `src/server.js` — Express 服务器（含路由骨架）
- `src/db.js` — SQLite 连接 + 初始化
- `src/config.js` — 环境变量配置
- `src/rate-limit.js` — 内存限流中间件
- `src/public/index.html` — SPA 入口
- `src/public/css/style.css` — 基础样式
- `src/public/js/app.js` — 前端逻辑
- `src/data/seed.json` — 种子数据
- `src/package.json` — 依赖声明

**适用场景：**
- URL 缩短器、个人博客、简单 CRUD 应用
- 不需要用户认证的小工具
- 单人使用的内部工具

## 新增骨架

1. 在 `H:\claude-assets\skeletons\<骨架名>\` 下创建完整目录结构
2. 包含 `README.md` 说明用途和启动方式
3. 确保 `package.json` 依赖版本锁定
4. 在本文件加一节描述
