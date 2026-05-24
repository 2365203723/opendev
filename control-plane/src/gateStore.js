function createGateStore(db) {
  // ========== 新方法（分层 scope）==========
  function recordGate(scopeType, scopeId, gateName, status, evidencePath = null) {
    const stmt = db.prepare(`
      INSERT INTO gates (scope_type, scope_id, gate_name, status, evidence_path, checked_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(scope_type, scope_id, gate_name) DO UPDATE SET
        status = excluded.status,
        evidence_path = excluded.evidence_path,
        checked_at = excluded.checked_at
    `);

    stmt.run(scopeType, scopeId, gateName, status, evidencePath);
  }

  function getGates(scopeType, scopeId) {
    return db.prepare(`
      SELECT id, scope_type, scope_id, gate_name, status, evidence_path, checked_at
      FROM gates
      WHERE scope_type = ? AND scope_id = ?
      ORDER BY gate_name ASC
    `).all(scopeType, scopeId);
  }

  function listGatesByScopeType(scopeType) {
    return db.prepare(`
      SELECT id, scope_type, scope_id, gate_name, status, evidence_path, checked_at
      FROM gates
      WHERE scope_type = ?
      ORDER BY scope_id ASC, gate_name ASC
    `).all(scopeType);
  }

  // ========== 兼容层（project-scope）==========
  function recordProjectGate(projectName, name, status, evidencePath = null) {
    return recordGate('project', projectName, name, status, evidencePath);
  }

  function getProjectGates(projectName) {
    return getGates('project', projectName);
  }

  return {
    // 新方法
    recordGate,
    getGates,
    listGatesByScopeType,

    // 兼容层
    recordProjectGate,
    getProjectGates,
  };
}

module.exports = { createGateStore };
