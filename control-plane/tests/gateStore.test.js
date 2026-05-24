const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/db');
const { createGateStore } = require('../src/gateStore');

let tmpDir;
let db;
let store;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-store-test-'));
  db = openDatabase(path.join(tmpDir, 'test.db'));
  store = createGateStore(db);
});

afterEach(() => {
  if (db) db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('分层 Gate', () => {
  it('recordGate 记录 milestone-scope gate', () => {
    store.recordGate('milestone', 'm1', 'Gate A', 'pass', '/path/to/evidence');

    const gates = store.getGates('milestone', 'm1');
    expect(gates).toHaveLength(1);
    expect(gates[0].scope_type).toBe('milestone');
    expect(gates[0].scope_id).toBe('m1');
    expect(gates[0].gate_name).toBe('Gate A');
    expect(gates[0].status).toBe('pass');
    expect(gates[0].evidence_path).toBe('/path/to/evidence');
  });

  it('recordGate 记录 workstream-scope gate', () => {
    store.recordGate('workstream', 'w1', 'Gate B', 'pending');

    const gates = store.getGates('workstream', 'w1');
    expect(gates).toHaveLength(1);
    expect(gates[0].scope_type).toBe('workstream');
    expect(gates[0].scope_id).toBe('w1');
    expect(gates[0].gate_name).toBe('Gate B');
    expect(gates[0].status).toBe('pending');
    expect(gates[0].evidence_path).toBeNull();
  });

  it('recordGate 更新已存在的 gate', () => {
    store.recordGate('milestone', 'm1', 'Gate A', 'pending');
    store.recordGate('milestone', 'm1', 'Gate A', 'pass', '/new/evidence');

    const gates = store.getGates('milestone', 'm1');
    expect(gates).toHaveLength(1);
    expect(gates[0].status).toBe('pass');
    expect(gates[0].evidence_path).toBe('/new/evidence');
  });

  it('getGates 返回指定 scope 的所有 gates', () => {
    store.recordGate('milestone', 'm1', 'Gate A', 'pass');
    store.recordGate('milestone', 'm1', 'Gate B', 'pending');
    store.recordGate('milestone', 'm2', 'Gate C', 'pass');

    const m1Gates = store.getGates('milestone', 'm1');
    expect(m1Gates).toHaveLength(2);
    expect(m1Gates.map(g => g.gate_name)).toEqual(['Gate A', 'Gate B']);

    const m2Gates = store.getGates('milestone', 'm2');
    expect(m2Gates).toHaveLength(1);
    expect(m2Gates[0].gate_name).toBe('Gate C');
  });

  it('listGatesByScopeType 返回所有 milestone gates', () => {
    store.recordGate('milestone', 'm1', 'Gate A', 'pass');
    store.recordGate('milestone', 'm2', 'Gate B', 'pending');
    store.recordGate('workstream', 'w1', 'Gate C', 'pass');

    const milestoneGates = store.listGatesByScopeType('milestone');
    expect(milestoneGates).toHaveLength(2);
    expect(milestoneGates.map(g => g.scope_id)).toEqual(['m1', 'm2']);

    const workstreamGates = store.listGatesByScopeType('workstream');
    expect(workstreamGates).toHaveLength(1);
    expect(workstreamGates[0].scope_id).toBe('w1');
  });
});

describe('兼容层（project-scope）', () => {
  it('recordProjectGate 记录 project-scope gate', () => {
    store.recordProjectGate('test-project', 'Gate 1', 'pass', '/evidence');

    const gates = store.getProjectGates('test-project');
    expect(gates).toHaveLength(1);
    expect(gates[0].scope_type).toBe('project');
    expect(gates[0].scope_id).toBe('test-project');
    expect(gates[0].gate_name).toBe('Gate 1');
    expect(gates[0].status).toBe('pass');
  });

  it('getProjectGates 返回 project 的所有 gates', () => {
    store.recordProjectGate('test-project', 'Gate 1', 'pass');
    store.recordProjectGate('test-project', 'Gate 2', 'pending');

    const gates = store.getProjectGates('test-project');
    expect(gates).toHaveLength(2);
    expect(gates.map(g => g.gate_name)).toEqual(['Gate 1', 'Gate 2']);
  });

  it('兼容层与新方法互通', () => {
    // 用兼容层记录
    store.recordProjectGate('test-project', 'Gate 1', 'pass');

    // 用新方法查询
    const gates = store.getGates('project', 'test-project');
    expect(gates).toHaveLength(1);
    expect(gates[0].gate_name).toBe('Gate 1');

    // 用新方法记录
    store.recordGate('project', 'test-project', 'Gate 2', 'pending');

    // 用兼容层查询
    const allGates = store.getProjectGates('test-project');
    expect(allGates).toHaveLength(2);
  });
});

describe('迁移后的 project gates', () => {
  it('迁移后的 project gates 可以正常查询', () => {
    // 模拟迁移后的数据（scope_type='project'）
    db.prepare(`
      INSERT INTO gates (scope_type, scope_id, gate_name, status, evidence_path, checked_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('project', 'old-project', 'Gate 1', 'pass', '/old/evidence', '2026-05-23T10:00:00');

    const gates = store.getProjectGates('old-project');
    expect(gates).toHaveLength(1);
    expect(gates[0].gate_name).toBe('Gate 1');
    expect(gates[0].status).toBe('pass');
  });
});
