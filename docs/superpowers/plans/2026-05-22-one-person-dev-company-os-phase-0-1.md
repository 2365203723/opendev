# One Person Dev Company OS Phase 0-1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first independently shippable control-plane slice: read-only indexing of existing file-system projects plus a local Web Console that can rebuild the index, display status, and enqueue Claude Code headless runs.

**Architecture:** Add a new `control-plane/` Node.js app instead of modifying the existing prototype `dashboard/`. Express serves local APIs and static UI, better-sqlite3 stores a rebuildable index, and all source-of-truth project artifacts remain in `E:\projects`, `G:\qa-reports`, `G:\logs`, and `H:\claude-assets`.

**Tech Stack:** Node.js 20, CommonJS, Express, better-sqlite3, helmet, Vitest, Supertest, vanilla HTML/CSS/JavaScript.

---

## Scope Boundary

This plan implements only Phase 0 and Phase 1 from `docs/superpowers/specs/2026-05-22-one-person-dev-company-os-design.md`:

- Phase 0: index current file-system state into SQLite without modifying project files.
- Phase 1: local Web Console, Control Plane API, and Claude Code headless runner queue.

Separate future plans must cover Phase 2 to Phase 5.

## File Structure

Create a new app under `control-plane/`.

```text
control-plane/
  package.json
  vitest.config.js
  src/
    app.js
    server.js
    config.js
    db.js
    store.js
    indexer/
      statusReader.js
      logReader.js
      lessonReader.js
      projectIndexer.js
    runner/
      commandBuilder.js
      claudeRunner.js
    public/
      index.html
      app.js
      styles.css
  tests/
    app.health.test.js
    config.test.js
    db.test.js
    statusReader.test.js
    projectIndexer.test.js
    logReader.test.js
    lessonReader.test.js
    dashboardApi.test.js
    commandBuilder.test.js
    claudeRunner.test.js
    publicFiles.test.js
    startup.integration.test.js
```

Design system: graphite background `#0f1419`, panel `#1c2732`, border `#2f3b47`, primary `#1d9bf0`, success `#00ba7c`, danger `#f9197f`, text `#e7e9ea`, muted `#8899a6`; native UI sans stack; 4px spacing base; 12px cards; 8px controls; subtle 120ms transitions.

---

## Task Summary

1. Create package, Vitest config, minimal Express app, health API, and temporary entrypoint dependencies.
2. Normalize config with localhost-only binding and current pipeline path defaults.
3. Add rebuildable SQLite schema and prepared-statement store.
4. Read `.status.json` files and index project agents, gates, and status artifacts.
5. Add recent log and lessons summary readers.
6. Expose index rebuild, dashboard, project detail, and runs APIs.
7. Add safe Claude Code headless command builder and runner.
8. Build local Web Console static UI.
9. Wire startup with real runtime factory and smoke command.
10. Run automated verification and browser verification.

## Implementation Details

Use the exact task code and commands from the current conversation plan. If a worker needs full per-task code, use the controller-provided task prompt rather than re-reading this file. Every task must follow TDD, run its scoped tests, then commit with the commit message specified by the controller.

## Self-Review

- Phase 0 read-only indexing maps to Tasks 3, 4, and 9.
- Phase 1 Web Console and Control Plane maps to Tasks 1, 2, 5, 6, 7, 8, 9, and 10.
- No task writes to `E:\projects` or other source-of-truth artifact paths.
- Phase 2 to Phase 5 are explicitly out of scope for this implementation branch.
