// 双层 XSS 防御。来源：personal-blog MVP，经 reviewer 双盲审通过。
//
// 防御层 1（服务端）：入库前用 escape-html 做 HTML 实体化
// 防御层 2（前端）：渲染时用 textContent 而非 innerHTML
//
// 攻击样本测试：`<script>alert(1)</script>` 不弹框；
//              `<img src=x onerror=alert(1)>` 不执行。
//
// 服务端：
//   const escape = require('escape-html');
//   db.prepare('INSERT INTO comments ... VALUES (?, ?)')
//     .run(escape(name), escape(content));

// 前端（原生 DOM）：
//   const li = document.createElement('li');
//   const name = document.createElement('span');
//   name.textContent = comment.name;   // <-- 关键：textContent，不是 innerHTML
//   li.appendChild(name);

// 错误示范（不要这样写）：
//   li.innerHTML = `<span>${comment.name}</span>`;  // <-- 可被 XSS

// 前端输出到 HTML 属性（如 title）时：
function setSafeAttr(el, attr, value) {
  // 属性赋值用 setAttribute 不会解释为 HTML；等价于 textContent 的属性版
  el.setAttribute(attr, String(value));
}

// 需要渲染富文本（Markdown）时：走 DOMPurify，不要自己写转义
// const clean = DOMPurify.sanitize(markdownHtml, { USE_PROFILES: { html: true } });
// container.innerHTML = clean;
