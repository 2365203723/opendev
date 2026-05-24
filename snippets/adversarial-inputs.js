// 对抗性测试数据集。来源：url-shortener 项目 escape-html bug 事后复盘。
//
// 场景：QA 对所有接受字符串输入的 API 做对抗测试，覆盖 Dev 自报盲区。
// 不适用：性能压测（用 k6/autocannon）、文件上传测试（另有专项）。
//
// 用法：
//   const { urls, injections, edge } = require('./adversarial-inputs');
//   // 在 Jest/Vitest 里：
//   test.each(Object.values(urls.tricky))('shorten handles tricky URL: %s', async (url) => {
//     const res = await request(app).post('/api/shorten').send({ url });
//     expect(res.status).not.toBe(500);
//   });

module.exports = {
  // ── URL 类 ──────────────────────────────────────────────────────────────
  // 这组是 url-shortener 类项目的核心对抗集。
  // withAmpersand 是 escape-html 误用 bug 的直接触发器（& → &amp; 导致重定向断链）。
  urls: {
    tricky: {
      withAmpersand:  'https://example.com/?a=1&b=2&c=3',
      withPlus:       'https://example.com/?q=hello+world',
      withChinese:    'https://example.com/中文路径',
      withPercent:    'https://example.com/?q=50%25off',
      withFragment:   'https://example.com/page#section',
      withPort:       'https://example.com:8443/path',
      withUserInfo:   'https://user:pass@example.com/',
      veryLong:       'https://example.com/' + 'a'.repeat(500),
    },
    shouldReject: {
      localhost:      'http://localhost:8080',
      loopback:       'http://127.0.0.1/admin',
      privateRange:   'http://192.168.1.1/',
      notAUrl:        'not-a-url',
      ftpScheme:      'ftp://example.com',
      jsScheme:       'javascript:alert(1)',
      dataScheme:     'data:text/html,<h1>hi</h1>',
    },
  },

  // ── 注入类 ───────────────────────────────────────────────────────────────
  injections: {
    sql:           "'; DROP TABLE links; --",
    sqlUnion:      "' UNION SELECT 1,2,3--",
    xss:           '<script>alert(1)</script>',
    xssImg:        '<img src=x onerror=alert(1)>',
    xssAttr:       '" onmouseover="alert(1)',
    pathTraversal: '../../etc/passwd',
    nullByte:      'hello\x00world',
    crlf:          'value\r\nX-Injected: header',
    templateExpr:  '{{7*7}}',
    shellMeta:     '$(id)',
  },

  // ── 边界 / 类型错误 ──────────────────────────────────────────────────────
  edge: {
    empty:          '',
    whitespace:     '   ',
    newline:        '\n',
    tab:            '\t',
    null:           null,
    undefined:      undefined,
    number:         123,
    zero:           0,
    negative:       -1,
    boolean:        true,
    array:          [],
    object:         {},
    veryLongString: 'x'.repeat(10_000),
  },

  // ── 幂等 / 并发 ──────────────────────────────────────────────────────────
  // 用法：在测试里连续调用同一请求 N 次，验证结果一致且无副作用叠加。
  concurrency: {
    repeatCount: 10,   // 同一请求重复次数
    parallelCount: 5,  // 并发请求数（用 Promise.all）
  },
};
