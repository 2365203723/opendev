function createConcurrencyControl() {
  const projectLocks = new Map();
  const workstreamLocks = new Map();

  function tryAcquireProjectLock(projectPath, runnerId, scope) {
    if (!projectPath) {
      throw new Error('projectPath is required');
    }

    const existing = projectLocks.get(projectPath);
    if (existing && existing.runnerId !== runnerId) {
      return false;
    }

    projectLocks.set(projectPath, {
      runnerId,
      workstreamId: scope.workstreamId || null,
      taskId: scope.taskId || null,
      lockedAt: new Date().toISOString()
    });

    return true;
  }

  function tryAcquireWorkstreamLock(workstreamId, runnerId, taskId) {
    if (!workstreamId) {
      throw new Error('workstreamId is required');
    }

    const existing = workstreamLocks.get(workstreamId);
    if (existing && existing.runnerId !== runnerId) {
      return false;
    }

    workstreamLocks.set(workstreamId, {
      runnerId,
      taskId: taskId || null,
      lockedAt: new Date().toISOString()
    });

    return true;
  }

  function tryAcquire(runnerId, scope, isReadOnly = false) {
    if (!runnerId) {
      throw new Error('runnerId is required');
    }
    if (!scope || !scope.scopeType) {
      throw new Error('scope.scopeType is required');
    }
    if (isReadOnly) {
      return { success: true };
    }

    const { scopeType, projectPath, workstreamId, taskId } = scope;

    if (scopeType === 'project') {
      if (!projectPath) {
        return { success: false, reason: 'projectPath is required for project scope' };
      }
      if (!tryAcquireProjectLock(projectPath, runnerId, scope)) {
        const lock = projectLocks.get(projectPath);
        return { success: false, reason: `Project path ${projectPath} is locked by runner ${lock.runnerId}` };
      }
      return { success: true };
    }

    if (scopeType === 'milestone') {
      if (projectPath && !tryAcquireProjectLock(projectPath, runnerId, scope)) {
        const lock = projectLocks.get(projectPath);
        return { success: false, reason: `Project path ${projectPath} is locked by runner ${lock.runnerId}` };
      }
      return { success: true };
    }

    if (scopeType === 'workstream' || scopeType === 'task') {
      if (!workstreamId) {
        return { success: false, reason: 'workstreamId is required for workstream scope' };
      }
      if (!tryAcquireWorkstreamLock(workstreamId, runnerId, taskId)) {
        const lock = workstreamLocks.get(workstreamId);
        const taskInfo = lock.taskId ? ` (task ${lock.taskId})` : '';
        return { success: false, reason: `Workstream ${workstreamId} is locked by runner ${lock.runnerId}${taskInfo}` };
      }
      if (projectPath && !tryAcquireProjectLock(projectPath, runnerId, scope)) {
        workstreamLocks.delete(workstreamId);
        const lock = projectLocks.get(projectPath);
        return { success: false, reason: `Project path ${projectPath} is locked by runner ${lock.runnerId}` };
      }
      return { success: true };
    }

    return { success: false, reason: `Unknown scope type: ${scopeType}` };
  }

  function release(runnerId, scope) {
    if (!runnerId || !scope) {
      return;
    }

    if (scope.projectPath) {
      const lock = projectLocks.get(scope.projectPath);
      if (lock && lock.runnerId === runnerId) {
        projectLocks.delete(scope.projectPath);
      }
    }

    if (scope.workstreamId) {
      const lock = workstreamLocks.get(scope.workstreamId);
      if (lock && lock.runnerId === runnerId) {
        workstreamLocks.delete(scope.workstreamId);
      }
    }
  }

  function getLockStatus() {
    return {
      projectLocks: Array.from(projectLocks.entries()).map(([projectPath, lock]) => ({ projectPath, ...lock })),
      workstreamLocks: Array.from(workstreamLocks.entries()).map(([workstreamId, lock]) => ({ workstreamId, ...lock }))
    };
  }

  function cleanupStaleLocks(timeoutMs = 3600000) {
    const now = Date.now();
    let cleaned = 0;

    for (const [projectPath, lock] of projectLocks.entries()) {
      if (now - new Date(lock.lockedAt).getTime() > timeoutMs) {
        projectLocks.delete(projectPath);
        cleaned += 1;
      }
    }

    for (const [workstreamId, lock] of workstreamLocks.entries()) {
      if (now - new Date(lock.lockedAt).getTime() > timeoutMs) {
        workstreamLocks.delete(workstreamId);
        cleaned += 1;
      }
    }

    return cleaned;
  }

  return { tryAcquire, release, getLockStatus, cleanupStaleLocks };
}

module.exports = { createConcurrencyControl };
