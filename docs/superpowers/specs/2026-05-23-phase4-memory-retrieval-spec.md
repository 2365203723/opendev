# Phase 4: Memory Retrieval Integration Specification

> **范围说明：** 本文档描述的是记忆检索增强方案（向量嵌入、语义搜索、检索增强提示），属于 **Phase 3.5 / 后续记忆增强候选方案**，不是当前 Phase 4（大项目工作流：Product / Milestone / Workstream / Task + 分层 Gate + 并发控制）的执行范围。当前 Phase 4 的实施计划见 `docs/superpowers/plans/phase-4-implementation-plan.md`。

**Status:** Draft — 待后续迭代  
**Author:** System Architect  
**Date:** 2026-05-23  
**Related:** [Phase 4 Implementation Plan](../plans/phase-4-implementation-plan.md)

---

## 1. Executive Summary

Phase 4 integrates the memory system (Phase 3) into the agent runtime by implementing **retrieval-augmented prompting**. When an agent wakes up, the system retrieves relevant memory fragments and injects them into the agent's prompt, enabling context-aware decision-making without manual memory queries.

**Core Value:** Agents automatically receive relevant historical context (past decisions, user feedback, project state) at wake time, improving consistency and reducing repeated mistakes.

---

## 2. Architecture Overview

### 2.1 Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Agent Wake Event (heartbeat/on-demand)                      │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Runner: buildAgentPrompt()                                   │
│  1. Load base instructions (AGENTS.md)                       │
│  2. Call Memory API: GET /memory/retrieve                    │
│  3. Inject retrieval pack into prompt                        │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Memory API: /memory/retrieve                                 │
│  - Query: agentId + companyId + optional context            │
│  - Embedding search (cosine similarity)                      │
│  - Returns: top-K fragments (default K=10)                   │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Agent Execution (Claude API)                                 │
│  - Prompt includes: base instructions + retrieval pack       │
│  - Agent makes decisions informed by memory                  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| **Runner** (`control-plane/src/runner.js`) | Orchestrate retrieval + prompt injection at wake time |
| **Memory API** (`control-plane/src/memoryApi.js`) | Expose `/memory/retrieve` endpoint with embedding search |
| **DB Layer** (`control-plane/src/db.js`) | Execute vector similarity queries against `memory_fragments` |
| **Agent Prompt** | Consume retrieval pack and apply context to decisions |

---

## 3. API Specification

### 3.1 Retrieval Endpoint

**Endpoint:** `GET /memory/retrieve`

**Query Parameters:**
- `agentId` (required): UUID of the requesting agent
- `companyId` (required): UUID of the company scope
- `context` (optional): Free-text query for semantic search (default: agent's recent activity summary)
- `limit` (optional): Max fragments to return (default: 10, max: 50)

**Response:**
```json
{
  "fragments": [
    {
      "id": "frag_abc123",
      "type": "feedback",
      "content": "Never use mocks for database tests — we got burned last quarter when mocked tests passed but prod migration failed.",
      "metadata": {
        "createdAt": "2026-05-20T10:30:00Z",
        "source": "user correction",
        "tags": ["testing", "database"]
      },
      "score": 0.87
    }
  ],
  "query": "agent recent activity context",
  "totalMatches": 23
}
```

**Error Codes:**
- `400`: Missing required parameters
- `404`: Agent or company not found
- `500`: Embedding service failure

### 3.2 Embedding Strategy

**Phase 4.0 (MVP):** Use OpenAI `text-embedding-3-small` (1536 dimensions)
- **Why:** Fast, cheap, good enough for initial validation
- **Cost:** ~$0.02 per 1M tokens
- **Latency:** ~50ms per query

**Future (Phase 4.1+):** Migrate to local embedding model (e.g., `all-MiniLM-L6-v2`)
- **Why:** Zero API cost, lower latency, privacy
- **Tradeoff:** Requires model hosting infrastructure

---

## 4. Prompt Injection Format

### 4.1 Retrieval Pack Structure

The retrieval pack is injected into the agent prompt as a dedicated section:

```markdown
# Memory Context

The following memories were retrieved based on your current task context. Use them to inform your decisions and avoid repeating past mistakes.

## Feedback (2 items)
- **Testing:** Never use mocks for database tests — we got burned last quarter when mocked tests passed but prod migration failed. (2026-05-20)
- **Code Style:** This user prefers terse responses with no trailing summaries. (2026-05-18)

## Project State (1 item)
- **Release Freeze:** Merge freeze begins 2026-05-25 for mobile release cut. Flag any non-critical PR work scheduled after that date. (2026-05-22)

---
*Retrieved 3 of 23 total matches. Relevance scores: 0.87, 0.82, 0.79*
```

### 4.2 Injection Point

Insert retrieval pack **after** base instructions (AGENTS.md) and **before** task-specific context (issue description, wake reason).

**Rationale:** Memories provide background context but should not override explicit task instructions.

---

## 5. Implementation Plan

### 5.1 Phase 4.0: Core Retrieval (Week 1)

**Goal:** Agents receive top-10 relevant memories at wake time.

**Tasks:**
1. **DB Schema:** Add `embedding` column to `memory_fragments` (VECTOR type, 1536 dimensions)
2. **Embedding Service:** Implement `embedText(text)` wrapper around OpenAI API
3. **Retrieval API:** Implement `GET /memory/retrieve` with cosine similarity search
4. **Runner Integration:** Inject retrieval pack into `buildAgentPrompt()`
5. **Testing:** Verify retrieval accuracy with synthetic memory corpus

**Success Criteria:**
- Retrieval latency < 200ms (p95)
- Top-3 results have relevance score > 0.7 for known queries
- No prompt injection vulnerabilities (sanitize memory content)

### 5.2 Phase 4.1: Query Optimization (Week 2)

**Goal:** Improve retrieval relevance and reduce noise.

**Tasks:**
1. **Context Extraction:** Generate query from agent's recent activity (last 3 issues, recent comments)
2. **Hybrid Search:** Combine embedding similarity + keyword filters (e.g., memory type, date range)
3. **Re-ranking:** Apply LLM-based re-ranker to top-20 results, return top-10
4. **Caching:** Cache embeddings for static memories (feedback, reference types)

**Success Criteria:**
- User feedback: "Agent remembered X correctly" > 80% of test cases
- Retrieval latency < 150ms (p95) with caching

### 5.3 Phase 4.2: Adaptive Retrieval (Week 3)

**Goal:** Dynamically adjust retrieval strategy based on task type.

**Tasks:**
1. **Task Classification:** Detect task type (bug fix, feature, refactor) from issue labels
2. **Type-Specific Retrieval:** Prioritize feedback memories for bugs, project memories for features
3. **Negative Filtering:** Exclude stale memories (e.g., project state > 30 days old)
4. **Feedback Loop:** Log retrieval effectiveness (did agent cite memory? did user correct?)

**Success Criteria:**
- Task-specific retrieval improves relevance by 15% (measured by user corrections)
- Stale memory false positives < 5%

---

## 6. Data Model

### 6.1 Database Schema Changes

```sql
-- Add embedding column to memory_fragments
ALTER TABLE memory_fragments
ADD COLUMN embedding VECTOR(1536);

-- Create vector similarity index (pgvector)
CREATE INDEX idx_memory_fragments_embedding
ON memory_fragments
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Add retrieval metadata
ALTER TABLE memory_fragments
ADD COLUMN last_retrieved_at TIMESTAMP,
ADD COLUMN retrieval_count INTEGER DEFAULT 0;
```

### 6.2 Embedding Storage

**Strategy:** Store embeddings alongside fragment content in `memory_fragments` table.

**Rationale:**
- **Pro:** Simple, no additional storage layer
- **Pro:** Atomic updates (content + embedding in same transaction)
- **Con:** Increases row size (~6KB per fragment for 1536-dim float32)

**Alternative (Future):** Separate `memory_embeddings` table with foreign key to `memory_fragments`.

---

## 7. Security & Privacy

### 7.1 Prompt Injection Prevention

**Risk:** Malicious memory content could inject instructions into agent prompt.

**Mitigation:**
1. **Sanitization:** Escape markdown special characters in memory content before injection
2. **Validation:** Reject memories containing suspicious patterns (e.g., "ignore previous instructions")
3. **Sandboxing:** Wrap retrieval pack in clearly delimited section with header/footer markers

### 7.2 Cross-Company Isolation

**Risk:** Agent retrieves memories from wrong company due to query bug.

**Mitigation:**
1. **Mandatory Filtering:** All retrieval queries MUST include `companyId` filter at DB level
2. **Testing:** Add integration test verifying cross-company isolation
3. **Audit Logging:** Log all retrieval requests with agentId + companyId for forensics

---

## 8. Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Retrieval Latency (p50) | < 100ms | Time from API call to response |
| Retrieval Latency (p95) | < 200ms | Time from API call to response |
| Embedding Generation | < 50ms | OpenAI API call duration |
| Relevance Score (top-3) | > 0.7 | Cosine similarity for known queries |
| False Positive Rate | < 10% | Irrelevant memories in top-10 |
| Memory Overhead | < 10% | Additional prompt tokens vs. baseline |

---

## 9. Testing Strategy

### 9.1 Unit Tests

**File:** `control-plane/tests/memoryRetrieval.test.js`

**Coverage:**
- Embedding generation (mock OpenAI API)
- Cosine similarity calculation
- Query parameter validation
- Cross-company isolation

### 9.2 Integration Tests

**File:** `control-plane/tests/retrievalIntegration.test.js`

**Scenarios:**
1. **Happy Path:** Agent retrieves relevant feedback memory for known bug pattern
2. **Empty Result:** Agent with no memories returns empty retrieval pack
3. **Stale Memory:** Old project state memory is excluded by date filter
4. **Cross-Company:** Agent A cannot retrieve Agent B's memories (different company)

### 9.3 End-to-End Tests

**File:** `control-plane/tests/e2e/phase4.test.js`

**Scenarios:**
1. **Memory-Informed Decision:** Agent avoids mistake documented in feedback memory
2. **Context Carryover:** Agent references project state memory in PR description
3. **Retrieval Failure Graceful:** Agent continues execution if retrieval API times out

---

## 10. Rollout Plan

### 10.1 Phased Rollout

**Week 1:** Internal testing with synthetic memory corpus
**Week 2:** Beta rollout to 1 company (web-outsource)
**Week 3:** Full rollout to all companies

### 10.2 Feature Flag

**Flag:** `ENABLE_MEMORY_RETRIEVAL` (default: `false`)

**Behavior:**
- `true`: Inject retrieval pack into agent prompts
- `false`: Skip retrieval, use baseline prompt (backward compatible)

### 10.3 Rollback Plan

**Trigger:** Retrieval latency > 500ms OR false positive rate > 20%

**Action:**
1. Set `ENABLE_MEMORY_RETRIEVAL=false` via environment variable
2. Investigate root cause (embedding service outage? query bug?)
3. Fix issue in staging environment
4. Re-enable flag after validation

---

## 11. Monitoring & Observability

### 11.1 Metrics

**Retrieval Performance:**
- `memory.retrieval.latency` (histogram, ms)
- `memory.retrieval.count` (counter, by agentId)
- `memory.retrieval.error_rate` (counter, by error type)

**Relevance Quality:**
- `memory.retrieval.avg_score` (gauge, top-3 average)
- `memory.retrieval.empty_result_rate` (gauge, % of queries)

**Agent Behavior:**
- `agent.memory_citation_rate` (gauge, % of runs citing memory)
- `agent.user_correction_rate` (gauge, % of runs with user corrections)

### 11.2 Alerts

**Critical:**
- Retrieval latency p95 > 500ms for 5 minutes
- Retrieval error rate > 10% for 5 minutes

**Warning:**
- Average relevance score < 0.5 for 1 hour
- Empty result rate > 50% for 1 hour

---

## 12. Future Enhancements

### 12.1 Phase 4.3: Feedback Loop

**Goal:** Learn from agent behavior to improve retrieval.

**Approach:**
- Track which memories agent cites in responses
- Track which memories lead to user corrections
- Use feedback to re-rank or filter future retrievals

### 12.2 Phase 4.4: Multi-Modal Retrieval

**Goal:** Retrieve code snippets, diagrams, and other non-text artifacts.

**Approach:**
- Store code embeddings separately (use CodeBERT or similar)
- Retrieve relevant code examples alongside text memories
- Inject code snippets into prompt as reference material

### 12.3 Phase 4.5: Personalized Retrieval

**Goal:** Tailor retrieval to individual agent's role and expertise.

**Approach:**
- Build agent-specific retrieval profiles (e.g., QA agent prioritizes test-related memories)
- Use agent's past behavior to weight memory types
- A/B test personalized vs. generic retrieval

---

## 13. Open Questions

1. **Embedding Model Choice:** Should we start with OpenAI or invest in local model upfront?
   - **Decision:** Start with OpenAI for speed, migrate to local in Phase 4.1+
   
2. **Retrieval Trigger:** Should we retrieve on every wake, or only when agent explicitly needs context?
   - **Decision:** Retrieve on every wake (low cost, high value), add opt-out flag if needed

3. **Memory Staleness:** How do we detect and exclude outdated project state memories?
   - **Decision:** Use date-based filtering (exclude project memories > 30 days old), refine with user feedback

4. **Prompt Token Budget:** What if retrieval pack exceeds token limit?
   - **Decision:** Truncate to top-K (default K=10), prioritize by relevance score

---

## 14. Success Metrics

**Phase 4 is successful if:**

1. **Adoption:** 80% of agent wakes include retrieval pack (non-empty)
2. **Relevance:** User feedback "agent remembered correctly" > 75% of test cases
3. **Performance:** Retrieval adds < 200ms to wake latency (p95)
4. **Quality:** User correction rate decreases by 20% vs. Phase 3 baseline
5. **Stability:** Zero retrieval-related outages in first 30 days

---

## 15. References

- [Phase 3 Memory System Spec](./2026-05-22-one-person-dev-company-os-design.md#phase-3-memory-system)
- [Phase 4 Implementation Plan](../plans/phase-4-implementation-plan.md)
- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [OpenAI Embeddings API](https://platform.openai.com/docs/guides/embeddings)

---

**Approval:** Pending review by System Architect + CEO Agent  
**Next Steps:** Begin Phase 4.0 implementation (DB schema + retrieval API)
