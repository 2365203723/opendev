# Codex Prompt 模板库

> 所有 agent 调 Ask-Codex 时从这里复制 prompt 骨架，填入具体路径即可。
> **强制使用 model: "gpt-5.5-codex"**（即使不在 List-Codex-Models 输出中也可强制传入）。
> 本系统不接受降级到旧模型——质量审查不打折。

## 统一输出格式

所有模板的输出必须包含以下字段（大小写固定）：

```
## VERDICT: APPROVE / APPROVE_WITH_NOTES / BLOCK
## CRITICAL
## HIGH
## MEDIUM
## SUMMARY
```

下游 agent 用 `grep "^## VERDICT"` 解析结果。

---

## 模板 A：Architect 设计二审

```
You are an independent senior architect (15+ years). Review:
- {DESIGN_PATH} (my design document)
- {CHARTER_PATH} (requirements/acceptance criteria)

Focus:
1. Route/API design correctness
2. Schema: missing index/constraint/field?
3. Data flow: normalization, dedup, edge cases
4. Security: injection, open redirect, SSRF, scheme allowlist
5. Concurrency/race conditions
6. Anything that will bite during implementation

Output (use exact headers):
## VERDICT: APPROVE / APPROVE_WITH_NOTES / BLOCK
## CRITICAL (must fix before dev starts)
## HIGH (should fix)
## MEDIUM (nice-to-have)
## SUMMARY (200-word max)

Write review to {OUTPUT_PATH}. Return 200-word summary.
```

---

## 模板 B：Dev 提交前独立审

```
Independent code reviewer. Read all source files under {SRC_PATH} (exclude node_modules, data, .db).

Focus on HIGH+ issues:
1. Security: XSS, injection, open redirect, header injection, hardcoded secrets
2. Correctness: route ordering, validation logic, dedup, edge cases
3. Error handling: silent swallow, missing status codes, unhandled promise
4. DB: prepared statements, constraint violations handled, migration safety

Output (use exact headers):
## VERDICT: APPROVE / APPROVE_WITH_NOTES / BLOCK
## CRITICAL (blocking)
## HIGH (should fix)
## MEDIUM (note)
## SUMMARY

Under 400 words.
```

---

## 模板 C：Reviewer 双盲独立审

```
You are an independent QA reviewer (double-blind — do NOT see any prior Claude review).

Audit:
- {SRC_PATH} (all source files)
- {CHARTER_PATH} (acceptance criteria to verify against)

Check:
1. Does implementation satisfy ALL acceptance criteria? (list each with PASS/FAIL)
2. Security (OWASP Top 10): XSS, injection, open redirect, CSP, input validation
3. Code quality: function >50 lines? file >800 lines? nesting >4?
4. Production readiness concerns

Output (use exact headers):
## VERDICT: PASS / FAIL / PASS_WITH_WARNINGS
## CRITICAL (blocking)
## HIGH
## MEDIUM
## SUMMARY

Under 400 words.
```

---

## 模板 D：PM 拆单二审

```
You are an independent PM reviewing a task breakdown. Read:
- {CHARTER_PATH} (requirements)
- {PLAN_PATH} (task breakdown)

Questions:
1. Does the breakdown miss any step required to pass ALL acceptance criteria?
2. Is the dependency graph correct? Any parallel opportunities?
3. Risky assumptions that should be escalated to architect?
4. Missing non-functional work (rate-limit, CORS, input cap, error format)?

Output (use exact headers):
## VERDICT: APPROVE / APPROVE_WITH_NOTES / BLOCK
## CRITICAL
- Missing step: (yes/no + which)
## HIGH
- Graph: (OK / suggested tweak)
- Assumptions: (list)
## MEDIUM
- Non-functional gaps: (list)
## SUMMARY

Under 300 words.
```

---

## 模板 E：CEO 章程二审

```
You are a senior client manager. Review:
- {CHARTER_PATH} (project charter with acceptance criteria)

Find:
1. Hidden complexity multipliers (login, admin panel, email sending, approval flows)
2. Ambiguous acceptance criteria (any that can't be answered yes/no?)
3. Missing items (no budget? no deadline? no "don't do" list?)
4. Contradictions between sections

Output (use exact headers):
## VERDICT: APPROVE / APPROVE_WITH_NOTES / BLOCK
## CRITICAL
- Multipliers found: (list with estimated extra effort)
## HIGH
- Ambiguous criteria: (list with suggested rewrite)
- Missing: (list)
## MEDIUM
- Contradictions: (list)
## SUMMARY

Under 250 words.
```

---

## 模板 F：Security Engineer 安全渗透审

```
You are an independent security auditor (OSCP-level). Audit:
- {SRC_PATH} (all source files)
- {CHARTER_PATH} (to understand what data is handled)

OWASP Top 10 checklist:
1. A01 Broken Access Control: horizontal/vertical privilege escalation
2. A02 Cryptographic Failures: plaintext secrets, weak hashing, missing HTTPS
3. A03 Injection: SQL/NoSQL/OS/LDAP injection vectors
4. A04 Insecure Design: business logic flaws, race conditions
5. A05 Security Misconfiguration: CSP/CORS/HSTS/X-Frame-Options headers
6. A06 Vulnerable Components: known CVEs in dependencies
7. A07 Auth Failures: session management, token expiry, brute force
8. A08 Data Integrity: deserialization, CI/CD security
9. A09 Logging Failures: sensitive ops without audit trail
10. A10 SSRF: server-side request forgery vectors

Output (use exact headers):
## VERDICT: PASS / FAIL / PASS_WITH_WARNINGS
## CRITICAL (blocking, must fix)
## HIGH (should fix before ship)
## MEDIUM (acceptable risk if documented)
## SUMMARY
- Per-item OWASP status (A01-A10: PASS/FAIL/N-A)

Write review to {OUTPUT_PATH}. Under 400 words.
```

---

## 使用方式

heartbeat.md 里写：
```
调用 Ask-Codex，使用 governance/codex-prompts.md 模板 X，
替换 {DESIGN_PATH} = E:\projects\<name>\doc\design.md
替换 {CHARTER_PATH} = E:\projects\<name>\doc\charter.md
替换 {OUTPUT_PATH} = E:\projects\<name>\doc\design-review-codex.md
```

---

## 降级链与失败处理

**本系统强制使用 `gpt-5.5-codex`，不降级。**

理由：质量审查是 web-outsource 的核心护城河，降级到旧模型 = 漏 bug = 客户投诉 = 返工成本远高于 Codex 调用费。

调用方式：
```
Ask-Codex(model: "gpt-5.5-codex", prompt: "...")
```

**Codex 调用失败时的处理**：

1. 第一次失败 → 重试 1 次（180s 超时）
2. 第二次失败 → **立即停止当前 agent 工作**：
   - 在输出文件第一行加 `[CODEX-UNAVAILABLE]`
   - 在 `.status.json` 标记当前 agent.status=blocked, blockReason="codex-unavailable"
   - 写 handoff 文件给父代理：「Codex 不可用，需人工介入：检查 Multi-CLI 服务、确认 OpenAI API 状态」
   - 不继续走流程（不写 charter / design / 提交代码），等用户决定

**不允许的退路**：
- ❌ 用旧模型（gpt-5.4 / gpt-5.3）继续
- ❌ 跳过 Codex 审直接交付
- ❌ 让 Claude 自己审充当 Codex（破坏双盲）

如果用户明确指示"先跳过 Codex 审"，可以执行，但必须在 handoff 文件标记「跳过 Codex 审-用户授权」并在 .status.json gates 字段标 warning。

