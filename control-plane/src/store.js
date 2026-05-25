function createStore(db) {
  if (!db) return null;

  const upsertProject = db.prepare(`
    INSERT INTO projects (name, root_path, phase, complexity, reopen_count, updated_at)
    VALUES (@name, @rootPath, @phase, @complexity, @reopenCount, @updatedAt)
    ON CONFLICT(name) DO UPDATE SET
      root_path = excluded.root_path,
      phase = excluded.phase,
      complexity = excluded.complexity,
      reopen_count = excluded.reopen_count,
      updated_at = excluded.updated_at
  `);
  const gateColumns = db.prepare('PRAGMA table_info(gates)').all().map(column => column.name);
  const hasScopedGates = gateColumns.includes('scope_type');
  const deleteAgents = db.prepare('DELETE FROM agents WHERE project_name = ?');
  const deleteGates = hasScopedGates
    ? db.prepare("DELETE FROM gates WHERE scope_type = 'project' AND scope_id = ?")
    : db.prepare('DELETE FROM gates WHERE project_name = ?');
  const deleteArtifacts = db.prepare('DELETE FROM artifacts WHERE project_name = ?');
  const insertAgent = db.prepare(`
    INSERT INTO agents (project_name, name, status, last_run, block_reason)
    VALUES (@projectName, @name, @status, @lastRun, @blockReason)
  `);
  const insertGate = hasScopedGates
    ? db.prepare(`
      INSERT INTO gates (scope_type, scope_id, gate_name, status, evidence_path, checked_at)
      VALUES ('project', @projectName, @name, @status, @evidencePath, datetime('now'))
      ON CONFLICT(scope_type, scope_id, gate_name) DO UPDATE SET
        status = excluded.status,
        evidence_path = excluded.evidence_path,
        checked_at = excluded.checked_at
    `)
    : db.prepare(`
      INSERT INTO gates (project_name, name, status, evidence_path)
      VALUES (@projectName, @name, @status, @evidencePath)
    `);
  const insertArtifact = db.prepare(`
    INSERT INTO artifacts (project_name, type, path, hash, mtime_ms, summary)
    VALUES (@projectName, @type, @path, @hash, @mtimeMs, @summary)
  `);

  const replaceProjectIndexPayload = payload => {
    upsertProject.run(payload.project);
    deleteAgents.run(payload.project.name);
    deleteGates.run(payload.project.name);
    deleteArtifacts.run(payload.project.name);
    payload.agents.forEach(agent => insertAgent.run({ ...agent, projectName: payload.project.name }));
    payload.gates.forEach(gate => insertGate.run({ ...gate, projectName: payload.project.name }));
    payload.artifacts.forEach(artifact => insertArtifact.run({ ...artifact, projectName: payload.project.name }));
  };

  const replaceProjectIndexTxn = db.transaction(payload => {
    replaceProjectIndexPayload(payload);
  });

  const replaceProjectIndexesTxn = db.transaction(projectIndexes => {
    projectIndexes.forEach(replaceProjectIndexPayload);
  });

  const insertRun = db.prepare(`
    INSERT INTO runs (id, command_type, target_name, status, prompt, log_path, started_at)
    VALUES (@id, @commandType, @targetName, @status, @prompt, @logPath, @startedAt)
  `);
  const finishRun = db.prepare(`
    UPDATE runs
    SET status = @status, exit_code = @exitCode, error_message = @errorMessage, finished_at = @finishedAt,
        token_in = COALESCE(@tokenIn, token_in),
        token_out = COALESCE(@tokenOut, token_out),
        duration_ms = COALESCE(@durationMs, duration_ms),
        cost_cents = COALESCE(@costCents, cost_cents)
    WHERE id = @id
  `);
  const updateRunSessionId = db.prepare(`
    UPDATE runs SET session_id = @sessionId WHERE id = @id
  `);

  const insertCr = db.prepare(`
    INSERT INTO change_requests
      (id, project_name, title, source, scope, current_behavior, expected_behavior,
       acceptance_criteria, priority, status, ia_run_id, patch_run_id, regression_run_id,
       created_at, updated_at)
    VALUES
      (@id, @projectName, @title, @source, @scope, @currentBehavior, @expectedBehavior,
       @acceptanceCriteria, @priority, @status, @iaRunId, @patchRunId, @regressionRunId,
       @createdAt, @updatedAt)
  `);

  const updateCrStatusStmt = db.prepare(`
    UPDATE change_requests
    SET status = @status,
        ia_run_id = COALESCE(@iaRunId, ia_run_id),
        patch_run_id = COALESCE(@patchRunId, patch_run_id),
        regression_run_id = COALESCE(@regressionRunId, regression_run_id),
        updated_at = @updatedAt
    WHERE id = @id
  `);

  const upsertCrDocumentStmt = db.prepare(`
    INSERT OR REPLACE INTO cr_documents (cr_id, doc_type, path, content_summary)
    VALUES (@crId, @docType, @path, @contentSummary)
  `);

  const insertRegressionResult = db.prepare(`
    INSERT INTO regression_results
      (cr_id, run_id, status, total_tests, passed_tests, failed_tests, report_path, created_at)
    VALUES
      (@crId, @runId, @status, @totalTests, @passedTests, @failedTests, @reportPath, @createdAt)
  `);

  const selectScopedGates = hasScopedGates ? db.prepare(`
    SELECT id, scope_type AS scopeType, scope_id AS scopeId, gate_name AS gateName,
           status, evidence_path AS evidencePath, checked_at AS checkedAt
    FROM gates
    WHERE scope_type = ? AND scope_id = ?
    ORDER BY gate_name ASC
  `) : null;

  function listScopedGates(scopeType, scopeId) {
    return selectScopedGates ? selectScopedGates.all(scopeType, scopeId) : [];
  }

  function getProductTree(productId) {
    const product = db.prepare(`
      SELECT id, name, client_name AS clientName, root_path AS rootPath, status,
             created_at AS createdAt, updated_at AS updatedAt
      FROM products
      WHERE id = ?
    `).get(productId) || null;
    if (!product) return null;

    const milestones = db.prepare(`
      SELECT id, product_id AS productId, name, status, gate_scope AS gateScope,
             target_date AS targetDate, created_at AS createdAt, updated_at AS updatedAt
      FROM milestones
      WHERE product_id = ?
      ORDER BY created_at ASC
    `).all(product.id).map(milestone => {
      const workstreams = db.prepare(`
        SELECT id, milestone_id AS milestoneId, name, status, owner_role AS ownerRole,
               project_name AS projectName, created_at AS createdAt, updated_at AS updatedAt
        FROM workstreams
        WHERE milestone_id = ?
        ORDER BY created_at ASC
      `).all(milestone.id).map(workstream => ({
        ...workstream,
        gates: listScopedGates('workstream', workstream.id),
        tasks: db.prepare(`
          SELECT id, workstream_id AS workstreamId, title, status, agent_role AS agentRole,
                 priority, acceptance_ref AS acceptanceRef, created_at AS createdAt, updated_at AS updatedAt
          FROM tasks
          WHERE workstream_id = ?
          ORDER BY created_at ASC
        `).all(workstream.id)
      }));

      return {
        ...milestone,
        gates: listScopedGates('milestone', milestone.id),
        workstreams
      };
    });

    return {
      ...product,
      gates: listScopedGates('product', product.id),
      milestones
    };
  }

  return {
    replaceProjectIndex: payload => replaceProjectIndexTxn(payload),
    replaceProjectIndexes: projectIndexes => replaceProjectIndexesTxn(projectIndexes),
    listProjects: () => db.prepare(`
      SELECT name, root_path AS rootPath, phase, complexity, reopen_count AS reopenCount, updated_at AS updatedAt
      FROM projects
      ORDER BY updated_at DESC, name ASC
    `).all(),
    getProject: name => db.prepare(`
      SELECT name, root_path AS rootPath, phase, complexity, reopen_count AS reopenCount, updated_at AS updatedAt
      FROM projects
      WHERE name = ?
    `).get(name) || null,
    listAgents: projectName => db.prepare(`
      SELECT project_name AS projectName, name, status, last_run AS lastRun, block_reason AS blockReason
      FROM agents
      WHERE project_name = ?
      ORDER BY name ASC
    `).all(projectName),
    listGates: projectName => {
      const sql = hasScopedGates ? `
        SELECT scope_id AS projectName, gate_name AS name, status, evidence_path AS evidencePath, checked_at AS checkedAt
        FROM gates
        WHERE scope_type = 'project' AND scope_id = ?
        ORDER BY gate_name ASC
      ` : `
        SELECT project_name AS projectName, name, status, evidence_path AS evidencePath, checked_at AS checkedAt
        FROM gates
        WHERE project_name = ?
        ORDER BY name ASC
      `;
      return db.prepare(sql).all(projectName);
    },
    listArtifacts: projectName => db.prepare(`
      SELECT project_name AS projectName, type, path, hash, mtime_ms AS mtimeMs, summary, indexed_at AS indexedAt
      FROM artifacts
      WHERE project_name = ?
      ORDER BY type ASC, path ASC
    `).all(projectName),
    createRun: run => insertRun.run(run),
    finishRun: run => finishRun.run({
      id: run.id,
      status: run.status,
      exitCode: run.exitCode ?? null,
      errorMessage: run.errorMessage ?? null,
      finishedAt: run.finishedAt,
      tokenIn: run.tokenIn ?? null,
      tokenOut: run.tokenOut ?? null,
      durationMs: run.durationMs ?? null,
      costCents: run.costCents ?? null
    }),
    updateRunSessionId: (id, sessionId) => updateRunSessionId.run({ id, sessionId }),
    listRuns: () => db.prepare(`
      SELECT id, command_type AS commandType, target_name AS targetName, status, prompt, log_path AS logPath,
             exit_code AS exitCode, error_message AS errorMessage, started_at AS startedAt, finished_at AS finishedAt,
             session_id AS sessionId,
             token_in AS tokenIn, token_out AS tokenOut, duration_ms AS durationMs, cost_cents AS costCents
      FROM runs
      ORDER BY started_at DESC
      LIMIT 50
    `).all(),
    getRun: id => db.prepare(`
      SELECT id, command_type AS commandType, target_name AS targetName, status, prompt, log_path AS logPath,
             exit_code AS exitCode, error_message AS errorMessage, started_at AS startedAt, finished_at AS finishedAt,
             session_id AS sessionId,
             token_in AS tokenIn, token_out AS tokenOut, duration_ms AS durationMs, cost_cents AS costCents
      FROM runs WHERE id = ?
    `).get(id) || null,

    // ─── approvals ────────────────────────────────────────────────────────────
    createApproval: approval => db.prepare(`
      INSERT INTO approvals (id, run_id, prompt_snapshot, status, created_at)
      VALUES (@id, @runId, @promptSnapshot, 'pending', @createdAt)
    `).run(approval),
    getApproval: id => db.prepare(`
      SELECT id, run_id AS runId, prompt_snapshot AS promptSnapshot, status,
             created_at AS createdAt, resolved_at AS resolvedAt, resolution_note AS resolutionNote
      FROM approvals WHERE id = ?
    `).get(id) || null,
    updateApprovalStatus: (id, status, note) => db.prepare(`
      UPDATE approvals SET status = ?, resolved_at = ?, resolution_note = ? WHERE id = ?
    `).run(status, new Date().toISOString(), note || null, id),
    listPendingApprovals: () => db.prepare(`
      SELECT id, run_id AS runId, prompt_snapshot AS promptSnapshot, status,
             created_at AS createdAt, resolved_at AS resolvedAt, resolution_note AS resolutionNote
      FROM approvals WHERE status = 'pending'
      ORDER BY created_at ASC
    `).all(),

    // ─── cost summary ─────────────────────────────────────────────────────────
    getCostSummary: () => {
      const total = db.prepare(`SELECT COALESCE(SUM(cost_cents), 0) AS total FROM runs`).get().total;
      const byType = db.prepare(`
        SELECT command_type AS commandType,
               COALESCE(SUM(token_in), 0) AS totalTokenIn,
               COALESCE(SUM(token_out), 0) AS totalTokenOut,
               COALESCE(SUM(cost_cents), 0) AS totalCostCents,
               COUNT(*) AS runCount
        FROM runs
        GROUP BY command_type
        ORDER BY totalCostCents DESC
      `).all();
      return { totalCostCents: total, byCommandType: byType };
    },
    createCr: cr => insertCr.run(cr),
    getCr: id => db.prepare(`
      SELECT id, project_name AS projectName, title, source, scope,
             current_behavior AS currentBehavior, expected_behavior AS expectedBehavior,
             acceptance_criteria AS acceptanceCriteria, priority, status,
             ia_run_id AS iaRunId, patch_run_id AS patchRunId, regression_run_id AS regressionRunId,
             created_at AS createdAt, updated_at AS updatedAt
      FROM change_requests
      WHERE id = ?
    `).get(id) || null,
    updateCrStatus: (id, { status, iaRunId = null, patchRunId = null, regressionRunId = null, updatedAt }) =>
      updateCrStatusStmt.run({ id, status, iaRunId, patchRunId, regressionRunId, updatedAt }),
    listCrs: (projectName) => {
      if (projectName !== undefined) {
        return db.prepare(`
          SELECT id, project_name AS projectName, title, source, scope,
                 current_behavior AS currentBehavior, expected_behavior AS expectedBehavior,
                 acceptance_criteria AS acceptanceCriteria, priority, status,
                 ia_run_id AS iaRunId, patch_run_id AS patchRunId, regression_run_id AS regressionRunId,
                 created_at AS createdAt, updated_at AS updatedAt
          FROM change_requests
          WHERE project_name = ?
          ORDER BY created_at DESC
        `).all(projectName);
      }
      return db.prepare(`
        SELECT id, project_name AS projectName, title, source, scope,
               current_behavior AS currentBehavior, expected_behavior AS expectedBehavior,
               acceptance_criteria AS acceptanceCriteria, priority, status,
               ia_run_id AS iaRunId, patch_run_id AS patchRunId, regression_run_id AS regressionRunId,
               created_at AS createdAt, updated_at AS updatedAt
        FROM change_requests
        ORDER BY created_at DESC
      `).all();
    },
    upsertCrDocument: (crId, docType, path, contentSummary) =>
      upsertCrDocumentStmt.run({ crId, docType, path, contentSummary }),
    getCrDocument: (crId, docType) => db.prepare(`
      SELECT cr_id AS crId, doc_type AS docType, path, content_summary AS contentSummary,
             created_at AS createdAt
      FROM cr_documents
      WHERE cr_id = ? AND doc_type = ?
    `).get(crId, docType) || null,
    listCrDocuments: (crId) => db.prepare(`
      SELECT cr_id AS crId, doc_type AS docType, path, content_summary AS contentSummary,
             created_at AS createdAt
      FROM cr_documents
      WHERE cr_id = ?
      ORDER BY created_at ASC
    `).all(crId),
    createRegressionResult: result => insertRegressionResult.run(result),
    getLatestRegressionResult: crId => db.prepare(`
      SELECT id, cr_id AS crId, run_id AS runId, status,
             total_tests AS totalTests, passed_tests AS passedTests, failed_tests AS failedTests,
             report_path AS reportPath, created_at AS createdAt
      FROM regression_results
      WHERE cr_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(crId) || null,

    // ─── memory: raw_events ───────────────────────────────────────────────────
    createRawEvent: event => db.prepare(`
      INSERT INTO raw_events (id, event_type, scope_type, scope_id, payload, source, occurred_at)
      VALUES (@id, @eventType, @scopeType, @scopeId, @payload, @source, @occurredAt)
    `).run(event),
    getRawEvent: id => db.prepare(`
      SELECT id, event_type AS eventType, scope_type AS scopeType, scope_id AS scopeId,
             payload, source, occurred_at AS occurredAt, created_at AS createdAt
      FROM raw_events
      WHERE id = ?
    `).get(id) || null,
    listRawEvents: ({ scopeType, scopeId, eventType, limit = 100, offset = 0 } = {}) => {
      const conditions = [];
      const params = [];
      if (scopeType !== undefined) { conditions.push('scope_type = ?'); params.push(scopeType); }
      if (scopeId !== undefined) { conditions.push('scope_id = ?'); params.push(scopeId); }
      if (eventType !== undefined) { conditions.push('event_type = ?'); params.push(eventType); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(limit, offset);
      return db.prepare(`
        SELECT id, event_type AS eventType, scope_type AS scopeType, scope_id AS scopeId,
               payload, source, occurred_at AS occurredAt, created_at AS createdAt
        FROM raw_events
        ${where}
        ORDER BY occurred_at DESC
        LIMIT ? OFFSET ?
      `).all(...params);
    },

    // ─── memory: episodes ─────────────────────────────────────────────────────
    createEpisode: episode => db.prepare(`
      INSERT INTO episodes
        (id, scope_type, scope_id, title, summary, event_ids, artifact_paths,
         conclusion, generated_by_run_id, valid_from)
      VALUES
        (@id, @scopeType, @scopeId, @title, @summary, @eventIds, @artifactPaths,
         @conclusion, @generatedByRunId, @validFrom)
    `).run(episode),
    getEpisode: id => db.prepare(`
      SELECT id, scope_type AS scopeType, scope_id AS scopeId, title, summary,
             event_ids AS eventIds, artifact_paths AS artifactPaths, conclusion,
             generated_by_run_id AS generatedByRunId, valid_from AS validFrom,
             created_at AS createdAt
      FROM episodes
      WHERE id = ?
    `).get(id) || null,
    listEpisodes: ({ scopeType, scopeId, limit = 100, offset = 0 } = {}) => {
      const conditions = [];
      const params = [];
      if (scopeType !== undefined) { conditions.push('scope_type = ?'); params.push(scopeType); }
      if (scopeId !== undefined) { conditions.push('scope_id = ?'); params.push(scopeId); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(limit, offset);
      return db.prepare(`
        SELECT id, scope_type AS scopeType, scope_id AS scopeId, title, summary,
               event_ids AS eventIds, artifact_paths AS artifactPaths, conclusion,
               generated_by_run_id AS generatedByRunId, valid_from AS validFrom,
               created_at AS createdAt
        FROM episodes
        ${where}
        ORDER BY valid_from DESC
        LIMIT ? OFFSET ?
      `).all(...params);
    },

    // ─── memory: facts ────────────────────────────────────────────────────────
    createFact: fact => db.prepare(`
      INSERT INTO facts
        (id, fact_type, scope_type, scope_id, content, source_event_ids, source_paths,
         confidence, valid_from, expires_at, supersedes_id, status, generated_by_run_id)
      VALUES
        (@id, @factType, @scopeType, @scopeId, @content, @sourceEventIds, @sourcePaths,
         @confidence, @validFrom, @expiresAt, @supersedesId, @status, @generatedByRunId)
    `).run(fact),
    getFact: id => db.prepare(`
      SELECT id, fact_type AS factType, scope_type AS scopeType, scope_id AS scopeId,
             content, source_event_ids AS sourceEventIds, source_paths AS sourcePaths,
             confidence, valid_from AS validFrom, expires_at AS expiresAt,
             supersedes_id AS supersedesId, status, generated_by_run_id AS generatedByRunId,
             created_at AS createdAt
      FROM facts
      WHERE id = ?
    `).get(id) || null,
    listFacts: ({ scopeType, scopeId, status, limit = 100, offset = 0 } = {}) => {
      const conditions = [];
      const params = [];
      if (scopeType !== undefined) { conditions.push('scope_type = ?'); params.push(scopeType); }
      if (scopeId !== undefined) { conditions.push('scope_id = ?'); params.push(scopeId); }
      if (status !== undefined) { conditions.push('status = ?'); params.push(status); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(limit, offset);
      return db.prepare(`
        SELECT id, fact_type AS factType, scope_type AS scopeType, scope_id AS scopeId,
               content, source_event_ids AS sourceEventIds, source_paths AS sourcePaths,
               confidence, valid_from AS validFrom, expires_at AS expiresAt,
               supersedes_id AS supersedesId, status, generated_by_run_id AS generatedByRunId,
               created_at AS createdAt
        FROM facts
        ${where}
        ORDER BY valid_from DESC
        LIMIT ? OFFSET ?
      `).all(...params);
    },
    updateFactStatus: (id, status) => {
      db.prepare('UPDATE facts SET status = ? WHERE id = ?').run(status, id);
      return db.prepare(`
        SELECT id, fact_type AS factType, scope_type AS scopeType, scope_id AS scopeId,
               content, source_event_ids AS sourceEventIds, source_paths AS sourcePaths,
               confidence, valid_from AS validFrom, expires_at AS expiresAt,
               supersedes_id AS supersedesId, status, generated_by_run_id AS generatedByRunId,
               created_at AS createdAt
        FROM facts
        WHERE id = ?
      `).get(id) || null;
    },

    // ─── memory: retrieval_packs ──────────────────────────────────────────────
    upsertRetrievalPack: pack => db.prepare(`
      INSERT OR REPLACE INTO retrieval_packs
        (id, scope_type, scope_id, run_id, content, episode_ids, fact_ids, generated_at, expires_at)
      VALUES
        (@id, @scopeType, @scopeId, @runId, @content, @episodeIds, @factIds, @generatedAt, @expiresAt)
    `).run(pack),
    getRetrievalPack: id => db.prepare(`
      SELECT id, scope_type AS scopeType, scope_id AS scopeId, run_id AS runId,
             content, episode_ids AS episodeIds, fact_ids AS factIds,
             generated_at AS generatedAt, expires_at AS expiresAt, created_at AS createdAt
      FROM retrieval_packs
      WHERE id = ?
    `).get(id) || null,
    getLatestRetrievalPack: (scopeType, scopeId) => db.prepare(`
      SELECT id, scope_type AS scopeType, scope_id AS scopeId, run_id AS runId,
             content, episode_ids AS episodeIds, fact_ids AS factIds,
             generated_at AS generatedAt, expires_at AS expiresAt, created_at AS createdAt
      FROM retrieval_packs
      WHERE scope_type = ? AND scope_id = ? AND expires_at > datetime('now')
      ORDER BY generated_at DESC
      LIMIT 1
    `).get(scopeType, scopeId) || null,
    listRetrievalPacks: (scopeType, scopeId, limit = 100) => db.prepare(`
      SELECT id, scope_type AS scopeType, scope_id AS scopeId, run_id AS runId,
             content, episode_ids AS episodeIds, fact_ids AS factIds,
             generated_at AS generatedAt, expires_at AS expiresAt, created_at AS createdAt
      FROM retrieval_packs
      WHERE scope_type = ? AND scope_id = ?
      ORDER BY generated_at DESC
      LIMIT ?
    `).all(scopeType, scopeId, limit),

    // ─── Phase 4: 四层项目结构 ─────────────────────────────────────────────────
    createProduct: product => db.prepare(`
      INSERT INTO products (id, name, client_name, root_path, status, created_at, updated_at)
      VALUES (@id, @name, @clientName, @rootPath, @status, @createdAt, @updatedAt)
    `).run(product),
    getProduct: id => db.prepare(`
      SELECT id, name, client_name AS clientName, root_path AS rootPath, status,
             created_at AS createdAt, updated_at AS updatedAt
      FROM products
      WHERE id = ?
    `).get(id) || null,
    listProducts: () => db.prepare(`
      SELECT id, name, client_name AS clientName, root_path AS rootPath, status,
             created_at AS createdAt, updated_at AS updatedAt
      FROM products
      ORDER BY created_at DESC
    `).all(),
    updateProduct: (id, updates) => {
      const fields = [];
      const params = [];
      if (updates.name !== undefined) { fields.push('name = ?'); params.push(updates.name); }
      if (updates.clientName !== undefined) { fields.push('client_name = ?'); params.push(updates.clientName); }
      if (updates.rootPath !== undefined) { fields.push('root_path = ?'); params.push(updates.rootPath); }
      if (updates.status !== undefined) { fields.push('status = ?'); params.push(updates.status); }
      fields.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(id);
      db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    },
    deleteProduct: id => db.prepare('DELETE FROM products WHERE id = ?').run(id),

    createMilestone: milestone => db.prepare(`
      INSERT INTO milestones (id, product_id, name, status, gate_scope, target_date, created_at, updated_at)
      VALUES (@id, @productId, @name, @status, @gateScope, @targetDate, @createdAt, @updatedAt)
    `).run(milestone),
    getMilestone: id => db.prepare(`
      SELECT id, product_id AS productId, name, status, gate_scope AS gateScope,
             target_date AS targetDate, created_at AS createdAt, updated_at AS updatedAt
      FROM milestones
      WHERE id = ?
    `).get(id) || null,
    listMilestones: productId => db.prepare(`
      SELECT id, product_id AS productId, name, status, gate_scope AS gateScope,
             target_date AS targetDate, created_at AS createdAt, updated_at AS updatedAt
      FROM milestones
      WHERE product_id = ?
      ORDER BY created_at ASC
    `).all(productId),
    updateMilestone: (id, updates) => {
      const fields = [];
      const params = [];
      if (updates.name !== undefined) { fields.push('name = ?'); params.push(updates.name); }
      if (updates.status !== undefined) { fields.push('status = ?'); params.push(updates.status); }
      if (updates.gateScope !== undefined) { fields.push('gate_scope = ?'); params.push(updates.gateScope); }
      if (updates.targetDate !== undefined) { fields.push('target_date = ?'); params.push(updates.targetDate); }
      fields.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(id);
      db.prepare(`UPDATE milestones SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    },
    deleteMilestone: id => db.prepare('DELETE FROM milestones WHERE id = ?').run(id),

    createWorkstream: workstream => db.prepare(`
      INSERT INTO workstreams (id, milestone_id, name, status, owner_role, project_name, created_at, updated_at)
      VALUES (@id, @milestoneId, @name, @status, @ownerRole, @projectName, @createdAt, @updatedAt)
    `).run(workstream),
    getWorkstream: id => db.prepare(`
      SELECT id, milestone_id AS milestoneId, name, status, owner_role AS ownerRole,
             project_name AS projectName, created_at AS createdAt, updated_at AS updatedAt
      FROM workstreams
      WHERE id = ?
    `).get(id) || null,
    listWorkstreams: milestoneId => db.prepare(`
      SELECT id, milestone_id AS milestoneId, name, status, owner_role AS ownerRole,
             project_name AS projectName, created_at AS createdAt, updated_at AS updatedAt
      FROM workstreams
      WHERE milestone_id = ?
      ORDER BY created_at ASC
    `).all(milestoneId),
    updateWorkstream: (id, updates) => {
      const fields = [];
      const params = [];
      if (updates.name !== undefined) { fields.push('name = ?'); params.push(updates.name); }
      if (updates.status !== undefined) { fields.push('status = ?'); params.push(updates.status); }
      if (updates.ownerRole !== undefined) { fields.push('owner_role = ?'); params.push(updates.ownerRole); }
      if (updates.projectName !== undefined) { fields.push('project_name = ?'); params.push(updates.projectName); }
      fields.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(id);
      db.prepare(`UPDATE workstreams SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    },
    deleteWorkstream: id => db.prepare('DELETE FROM workstreams WHERE id = ?').run(id),

    createTask: task => db.prepare(`
      INSERT INTO tasks (id, workstream_id, title, status, agent_role, priority, acceptance_ref, created_at, updated_at)
      VALUES (@id, @workstreamId, @title, @status, @agentRole, @priority, @acceptanceRef, @createdAt, @updatedAt)
    `).run(task),
    getTask: id => db.prepare(`
      SELECT id, workstream_id AS workstreamId, title, status, agent_role AS agentRole,
             priority, acceptance_ref AS acceptanceRef, created_at AS createdAt, updated_at AS updatedAt
      FROM tasks
      WHERE id = ?
    `).get(id) || null,
    listTasks: workstreamId => db.prepare(`
      SELECT id, workstream_id AS workstreamId, title, status, agent_role AS agentRole,
             priority, acceptance_ref AS acceptanceRef, created_at AS createdAt, updated_at AS updatedAt
      FROM tasks
      WHERE workstream_id = ?
      ORDER BY created_at ASC
    `).all(workstreamId),
    updateTask: (id, updates) => {
      const fields = [];
      const params = [];
      if (updates.title !== undefined) { fields.push('title = ?'); params.push(updates.title); }
      if (updates.status !== undefined) { fields.push('status = ?'); params.push(updates.status); }
      if (updates.agentRole !== undefined) { fields.push('agent_role = ?'); params.push(updates.agentRole); }
      if (updates.priority !== undefined) { fields.push('priority = ?'); params.push(updates.priority); }
      if (updates.acceptanceRef !== undefined) { fields.push('acceptance_ref = ?'); params.push(updates.acceptanceRef); }
      fields.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(id);
      db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    },
    deleteTask: id => db.prepare('DELETE FROM tasks WHERE id = ?').run(id),
    getProductTree,

    // ─── Phase 4: 分层 Gate 查询 ───────────────────────────────────────────────
    upsertGate: gate => db.prepare(`
      INSERT INTO gates (scope_type, scope_id, gate_name, status, evidence_path, checked_at)
      VALUES (@scopeType, @scopeId, @gateName, @status, @evidencePath, @checkedAt)
      ON CONFLICT(scope_type, scope_id, gate_name) DO UPDATE SET
        status = excluded.status,
        evidence_path = excluded.evidence_path,
        checked_at = excluded.checked_at
    `).run(gate),
    listGatesByScope: (scopeType, scopeId) => listScopedGates(scopeType, scopeId)
  };
}

module.exports = { createStore };
