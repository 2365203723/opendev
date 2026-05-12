# Codex Prompt 模板库

> 所有 agent 调 Ask-Codex 时从这里复制 prompt 骨架，填入具体路径即可。
> 模型默认 gpt-5.5，超时 fallback gpt-5.4。

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

Output 4 sections:
- CRITICAL (must fix before dev starts)
- HIGH (should fix)
- NICE-TO-HAVE
- VERDICT: APPROVE / APPROVE_WITH_NOTES / BLOCK

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

Output:
- CRITICAL (blocking)
- HIGH (should fix)
- MEDIUM (note)
- ACCEPT (what looks good)

Keep under 400 words.
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

Output:
- VERDICT: PASS / FAIL / PASS_WITH_WARNINGS
- CRITICAL issues (blocking)
- HIGH issues
- MEDIUM observations
- ACCEPT (what's good)

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

Output:
- Missing step: (yes/no + which)
- Graph: (OK / suggested tweak)
- Assumptions: (list)
- Non-functional gaps: (list)
- Verdict: APPROVE / APPROVE_WITH_NOTES / BLOCK

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

Output:
- Multipliers found: (list with estimated extra effort)
- Ambiguous criteria: (list with suggested rewrite)
- Missing: (list)
- Contradictions: (list)
- Verdict: APPROVE / NEEDS_REVISION

Under 250 words.
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
