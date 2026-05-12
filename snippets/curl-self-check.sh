#!/usr/bin/env bash
# 可复用的 curl 自检模板。Dev self-check 和 Reviewer 验证都能用。
#
# 用法：
#   bash curl-self-check.sh http://localhost:3000
#   (填到对应项目的 scripts/self-check.sh)

set -e
BASE=${1:-http://localhost:3000}

pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; exit 1; }

# ---- 1. 健康检查 ----
code=$(curl -s -o /dev/null -w "%{http_code}" $BASE/api/health)
[ "$code" = "200" ] && pass "health endpoint" || fail "health got $code"

# ---- 2. 首页 ----
code=$(curl -s -o /dev/null -w "%{http_code}" $BASE/)
[ "$code" = "200" ] && pass "index.html served" || fail "index got $code"

# ---- 3. CSP / security headers ----
headers=$(curl -sI $BASE/)
echo "$headers" | grep -qi "content-security-policy" && pass "CSP header" || fail "missing CSP header"
echo "$headers" | grep -qi "x-content-type-options: nosniff" && pass "X-Content-Type-Options" || fail "missing X-Content-Type-Options"

# ---- 4. 业务 API ----
# TODO: 按 design.md 补业务 API 检查

# ---- 5. 限流（如适用）----
# n_429=0
# for i in 1 2 3 4 5 6 7; do
#   code=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/api/items \
#     -H 'content-type: application/json' -d "{\"name\":\"t$i\"}")
#   [ "$code" = "429" ] && n_429=$((n_429+1))
# done
# [ $n_429 -ge 1 ] && pass "rate limit triggers 429" || fail "rate limit never triggered"

# ---- 6. XSS 转义（如适用）----
# resp=$(curl -s -X POST $BASE/api/items \
#   -H 'content-type: application/json' \
#   -d '{"name":"<script>alert(1)</script>"}')
# echo "$resp" | grep -q '"ok":true' && pass "xss input accepted" || fail "xss post rejected"
# last=$(curl -s $BASE/api/items | python -c "import sys,json; d=json.load(sys.stdin); print(d[0]['name'] if d else '')")
# echo "$last" | grep -q '&lt;script&gt;' && pass "xss stored as entity" || fail "xss stored raw!"

echo ""
echo "All self-check assertions passed."
