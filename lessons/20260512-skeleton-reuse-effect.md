# 骨架复用：express-sqlite-spa 在 url-shortener 中的效果

**类型**：skeleton-usage  
**项目来源**：url-shortener（2026-05-12）  
**严重程度**：low（记录成功模式）

## 问题描述

url-shortener 项目复用了 express-sqlite-spa 骨架（来自 personal-blog MVP，已 10/10 验收通过）。设计文档明确指出骨架与本项目技术栈 1:1 匹配。

## 复用效果

### 直接拷贝的部分（0 修改）

| 组件 | 行数 | 说明 |
|------|------|------|
| `db.js` | ~50 | WAL 模式、DATA_DIR 自动创建、seed 加载逻辑 |
| `rate-limit.js` | ~25 | 内存固定窗口限流（本项目要求完全一致：5 次/IP/60 秒） |
| `server.js` 框架 | ~80 | 安全头、CSP、JSON body limit、静态托管 |
| `public/index.html` 模式 | ~40 | 表单 + 列表 + fetch 模式 |

**小计**：约 195 行代码零修改直接复用。

### 需要改动的部分

| 组件 | 改动 | 工作量 |
|------|------|--------|
| schema | `items` → `links`，新增 `code` / `clickCount` 字段 | 15 分钟 |
| 路由 | `/api/items` → `/api/shorten` / `/api/links` / `/:code` | 30 分钟 |
| 短码生成 + 碰撞重试 | 新工具函数 `shortCode.js` | 20 分钟 |
| URL 校验 | 新工具函数 `validateUrl.js` | 15 分钟 |
| 前端 | 改表单字段 + 列表列 | 20 分钟 |

**小计**：约 100 分钟改动。

### 总工作量对比

| 场景 | 工作量 |
|------|--------|
| 从零开始写 | ~4 小时（Express 初始化、DB 设置、路由、前端、测试） |
| 复用骨架 | ~2 小时（拷贝 + 改 schema + 新工具函数 + 改前端） |
| **节省** | **~50%** |

## 根因

骨架的设计决策与 url-shortener 的需求高度重合：

1. **技术栈一致**：Node.js 20 LTS + Express 4.x + better-sqlite3 + helmet
2. **架构模式一致**：REST API + SQLite 持久化 + 内存限流 + 静态首页
3. **安全策略一致**：CSP + 参数化查询 + 前端 textContent 防 XSS
4. **部署模式一致**：单命令启动 `npm start`，数据文件本地存储

## 预防规则

**Architect 检查清单**：
- [ ] 新项目启动前，搜索已有骨架是否覆盖 70%+ 的技术栈
- [ ] 如果骨架已验收通过（10/10 或等价），优先复用而非从零开始
- [ ] 在设计文档中明确列出"直接拷贝"和"需改动"两部分，便于 Dev 快速定位

**Dev 检查清单**：
- [ ] 拷贝骨架后，先跑 `npm install` + `npm start` 验证基础框架可用
- [ ] 改 schema 时保留骨架的 pragma 和索引策略（如 WAL 模式）
- [ ] 改路由时保留骨架的注册顺序和中间件挂载位置

**PM 检查清单**：
- [ ] 项目预估时，如果有可复用骨架，工作量可下调 30-50%
- [ ] 骨架复用的前提是"已验收通过"；未验收的骨架不应复用

## 相关经验

参考 `frontend-dev.md` 条 2：better-sqlite3 同步 API + `INSERT OR IGNORE` seed 是 Windows 最省心。本条是其上层应用：**骨架复用是加速 MVP 的有效手段，前提是骨架已验证可靠**。
