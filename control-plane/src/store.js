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
  const deleteAgents = db.prepare('DELETE FROM agents WHERE project_name = ?');
  const deleteGates = db.prepare('DELETE FROM gates WHERE project_name = ?');
  const deleteArtifacts = db.prepare('DELETE FROM artifacts WHERE project_name = ?');
  const insertAgent = db.prepare(`
    INSERT INTO agents (project_name, name, status, last_run, block_reason)
    VALUES (@projectName, @name, @status, @lastRun, @blockReason)
  `);
  const insertGate = db.prepare(`
    INSERT INTO gates (project_name, name, status, evidence_path)
    VALUES (@projectName, @name, @status, @evidencePath)
  `);
  const insertArtifact = db.prepare(`
    INSERT INTO artifacts (project_name, type, path, hash, mtime_ms, summary)
    VALUES (@projectName, @type, @path, @hash, @mtimeMs, @summary)
  `);

  const replaceProjectIndexTxn = db.transaction(payload => {
    upsertProject.run(payload.project);
    deleteAgents.run(payload.project.name);
    deleteGates.run(payload.project.name);
    deleteArtifacts.run(payload.project.name);
    payload.agents.forEach(agent => insertAgent.run({ ...agent, projectName: payload.project.name }));
    payload.gates.forEach(gate => insertGate.run({ ...gate, projectName: payload.project.name }));
    payload.artifacts.forEach(artifact => insertArtifact.run({ ...artifact, projectName: payload.project.name }));
  });

  const insertRun = db.prepare(`
    INSERT INTO runs (id, command_type, target_name, status, prompt, log_path, started_at)
    VALUES (@id, @commandType, @targetName, @status, @prompt, @logPath, @startedAt)
  `);
  const finishRun = db.prepare(`
    UPDATE runs
    SET status = @status, exit_code = @exitCode, error_message = @errorMessage, finished_at = @finishedAt
    WHERE id = @id
  `);

  return {
    replaceProjectIndex: payload => replaceProjectIndexTxn(payload),
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
    listGates: projectName => db.prepare(`
      SELECT project_name AS projectName, name, status, evidence_path AS evidencePath, checked_at AS checkedAt
      FROM gates
      WHERE project_name = ?
      ORDER BY name ASC
    `).all(projectName),
    listArtifacts: projectName => db.prepare(`
      SELECT project_name AS projectName, type, path, hash, mtime_ms AS mtimeMs, summary, indexed_at AS indexedAt
      FROM artifacts
      WHERE project_name = ?
      ORDER BY type ASC, path ASC
    `).all(projectName),
    createRun: run => insertRun.run(run),
    finishRun: run => finishRun.run(run),
    listRuns: () => db.prepare(`
      SELECT id, command_type AS commandType, target_name AS targetName, status, prompt, log_path AS logPath,
             exit_code AS exitCode, error_message AS errorMessage, started_at AS startedAt, finished_at AS finishedAt
      FROM runs
      ORDER BY started_at DESC
      LIMIT 50
    `).all()
  };
}

module.exports = { createStore };
