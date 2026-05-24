# 内存限流 Map 的泄漏风险

**类型**：bug-pattern  
**项目来源**：url-shortener（2026-05-12）  
**严重程度**：low

## 问题描述

url-shortener 使用内存 Map 实现 IP 限流：

```js
const buckets = new Map(); // Map<ip, timestamp[]>

function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const window = 60000; // 60 秒
  
  if (!buckets.has(ip)) {
    buckets.set(ip, []);
  }
  
  const timestamps = buckets.get(ip);
  timestamps.push(now);
  
  // 过滤过期时间戳
  const recent = timestamps.filter(t => now - t < window);
  buckets.set(ip, recent);
  
  if (recent.length > 5) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  
  next();
}
```

**问题**：当某个 IP 的请求频率降低后，其时间戳数组会被过滤至空数组 `[]`，但 Map 的 key 永远不会被删除。长期运行下，Map 会积累大量空数组 key，导致内存缓增。

**实测**：
- 1000 个不同 IP 访问后，`buckets.size === 1000`
- 这些 IP 停止访问 1 分钟后，`buckets.get(ip).length === 0`，但 key 仍存在
- 长期运行（数月），Map 可能积累数万个空 key

## 根因

实现中缺少"清理过期 key"的逻辑。每次请求只过滤时间戳数组，不检查数组是否为空。

## 解决方案

### 方案 A：被动清理（推荐 MVP）

在过滤后检查数组是否为空，为空则删除 key：

```js
const recent = timestamps.filter(t => now - t < window);

if (recent.length === 0) {
  buckets.delete(ip);
} else {
  buckets.set(ip, recent);
}
```

**优点**：无额外开销，清理自然发生  
**缺点**：如果某个 IP 长期不访问，key 永不清理

### 方案 B：主动清理（推荐生产）

定期扫描 Map，删除空数组 key：

```js
setInterval(() => {
  for (const [ip, timestamps] of buckets.entries()) {
    if (timestamps.length === 0) {
      buckets.delete(ip);
    }
  }
}, 60000); // 每分钟扫一次
```

**优点**：保证 Map 不会无限增长  
**缺点**：多一个定时器，但开销极小

### 方案 C：LRU 缓存（过度设计）

使用 `lru-cache` 包，自动过期 key。不推荐 MVP 阶段使用。

## 预防规则

**Dev 检查清单**：
- [ ] 如果使用 `Map` 或 `Object` 存储临时数据（如限流桶、缓存），检查是否有清理逻辑
- [ ] 对于"过期后应删除"的数据，明确说明清理策略（被动 / 主动 / TTL）
- [ ] 长期运行的服务，应在内存监控中关注 Map 大小

**Reviewer 检查清单**：
- [ ] 搜索代码中的 `new Map()` 和 `new Object()`，检查是否有对应的 `delete` 或清理逻辑
- [ ] 如果是限流 / 缓存 / 会话存储，询问"长期运行下 Map 会无限增长吗？"
- [ ] 如果是 MVP 且客户接受重启清零，可标记为 LOW 风险；如果是 7×24 服务，必须修复

## 影响评估

| 场景 | 影响 | 建议 |
|------|------|------|
| 本地小团队（url-shortener） | 低。每周重启一次，内存不会爆 | 可接受，记录为已知限制 |
| 云部署 7×24 服务 | 中。数月后内存缓增 | 加方案 B（主动清理） |
| 高并发（>1000 QPS） | 高。Map 增长速度快 | 改用 Redis 或 LRU 缓存 |

## 相关经验

参考 `frontend-dev.md` 条 1：限流用进程内存 Map + IP 共用桶，MVP 阶段够用。本条是其补充：**内存 Map 方案的长期运行风险**。
