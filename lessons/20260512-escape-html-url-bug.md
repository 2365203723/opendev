# escape-html 不应用于 URL 存储

**类型**：bug-pattern  
**项目来源**：url-shortener（2026-05-12）  
**严重程度**：HIGH

## 问题描述

在 `src/routes/links.js` 中，POST /api/shorten 端点对 URL 调用了 `escape-html`：

```js
code = createLink(escape(normalizedUrl));
```

这导致 URL 中的 `&` 被转义为 `&amp;`，破坏了重定向功能。

**实测验证**：
- 输入：`https://example.com/search?a=1&b=2&c=3`
- 存入 DB：`https://example.com/search?a=1&amp;b=2&amp;c=3`
- GET /api/links 返回：`originalUrl: "https://example.com/search?a=1&amp;b=2&amp;c=3"`（错误）
- 302 Location 头：`https://example.com/search?a=1&amp;b=2&amp;c=3`（重定向目标损坏）

结果：所有含 `&` 查询参数的 URL 重定向均失败，用户被导向错误地址。

## 根因

混淆了两个不同的转义场景：

1. **HTML 上下文**：用户输入的文本在 HTML 中渲染时需要转义（`&` → `&amp;`）
2. **URL 存储**：URL 本身是数据，不是 HTML，不应被转义

`escape-html` 的设计目的是防止 XSS，但在 URL 存储阶段使用它是错误的。URL 中的 `&` 是合法的查询参数分隔符，转义它会破坏 URL 的语义。

## 解决方案

移除 `escape()` 调用，直接存储 `normalizedUrl`：

```js
// 修复前
code = createLink(escape(normalizedUrl));

// 修复后
code = createLink(normalizedUrl);
```

XSS 防护已由前端 `textContent` 赋值（app.js）和 helmet CSP 覆盖，服务端无需对 URL 做 HTML 转义。

## 预防规则

**Dev 检查清单**：
- [ ] URL 存储时不调用 `escape-html` 或其他 HTML 转义函数
- [ ] URL 在数据库中存储的是原始值或规范化值（如 `new URL().toString()`），不是转义后的值
- [ ] 如果需要在 HTML 中渲染 URL，转义应在渲染层（前端 `textContent` 或后端模板引擎），不在存储层

**Reviewer 检查清单**：
- [ ] 搜索代码中是否有 `escape(url)` 或 `escape(originalUrl)` 的调用
- [ ] 验证 POST 响应的 `originalUrl` 与 GET /api/links 返回的 `originalUrl` 一致（不应有转义差异）
- [ ] 如果项目使用了 `escape-html`，确认它仅用于 HTML 渲染上下文，不用于数据存储

## 相关经验

参考 `frontend-dev.md` 条 3：前端防 XSS 用 `textContent` 比前端净化库更轻。本条是其服务端对应：**数据存储层不应做 HTML 转义，转义应在渲染层**。
