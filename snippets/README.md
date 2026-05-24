# Snippets 索引

经过至少 1 次生产使用验证的可复用代码片段。

## 核心

| 片段 | 场景 | 来源 |
|------|------|------|
| `rate-limit-memory.js` | 单进程内存限流 | personal-blog MVP |
| `xss-double-defense.js` | 服务端 escape + 前端 textContent 双层防御 | personal-blog MVP |
| `health-endpoint.js` | DevOps Gate 5 必需的 /api/health | skeleton v1 |
| `sqlite-seed-on-startup.js` | 启动 seed 不覆盖运行时字段 | personal-blog MVP |
| `adversarial-inputs.js` | QA 对抗性测试数据集（URL/注入/边界/并发） | url-shortener 事后复盘 |

## 使用约定

- 片段是**参考实现**，不是可 require 的库。按需拷贝到项目 `src/` 里
- 每个片段带头部注释说明场景 + 不适用场景
- 新发现的可复用 pattern（≥ 2 个项目用到）必须抽到这里
- 出现 bug 的 pattern 从这里**删除**，不留 broken 片段

## 添加新片段的标准

- ≥ 2 个项目实际使用过
- 通过 reviewer Codex 双盲审
- 头部注释必须含：场景 / 不适用场景 / 使用示例

## 相关

- 更完整的模板：`H:\claude-assets\skeletons\`
- 过往踩坑：`H:\claude-assets\lessons\`
