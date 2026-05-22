const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/db');
const { createStore } = require('../src/store');

let tmpDir, db, store;
const PROJECT_NAME = 'test-project';

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-store-test-'));
  db = openDatabase(path.join(tmpDir, 'control-plane.db'));
  store = createStore(db);
  db.prepare('INSERT INTO projects (name, root_path, phase, updated_at) VALUES (?, ?, ?, ?)')
    .run(PROJECT_NAME, 'E:/projects/test-project', 'build', '2026-05-23T00:00:00.000Z');
});

afterEach(() => {
  if (db) db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeCr(overrides = {}) {
  return {
    id: 'cr-001', projectName: PROJECT_NAME, title: 'fix login bug',
    source: 'user_input', scope: 'backend',
    currentBehavior: 'login fails', expectedBehavior: 'login succeeds',
    acceptanceCriteria: '["AC1"]', priority: 'high', status: 'open',
    iaRunId: null, patchRunId: null, regressionRunId: null,
    createdAt: '2026-05-23T01:00:00.000Z', updatedAt: '2026-05-23T01:00:00.000Z',
    ...overrides
  };
}

describe('createCr / getCr', () => {
  it('inserts a CR and getCr returns all fields', () => {
    store.createCr(makeCr());
    expect(store.getCr('cr-001')).toEqual({
      id: 'cr-001', projectName: PROJECT_NAME, title: 'fix login bug',
      source: 'user_input', scope: 'backend',
      currentBehavior: 'login fails', expectedBehavior: 'login succeeds',
      acceptanceCriteria: '["AC1"]', priority: 'high', status: 'open',
      iaRunId: null, patchRunId: null, regressionRunId: null,
      createdAt: '2026-05-23T01:00:00.000Z', updatedAt: '2026-05-23T01:00:00.000Z'
    });
  });

  it('getCr returns null for missing id', () => {
    expect(store.getCr('nonexistent')).toBeNull();
  });
});

describe('updateCrStatus', () => {
  beforeEach(() => { store.createCr(makeCr({ id: 'cr-002' })); });

  it('updates status and updatedAt', () => {
    store.updateCrStatus('cr-002', { status: 'ia_running', updatedAt: '2026-05-23T02:00:00.000Z' });
    const r = store.getCr('cr-002');
    expect(r.status).toBe('ia_running');
    expect(r.updatedAt).toBe('2026-05-23T02:00:00.000Z');
  });

  it('sets iaRunId', () => {
    store.updateCrStatus('cr-002', { status: 'ia_running', iaRunId: 'run-ia-1', updatedAt: '2026-05-23T02:00:00.000Z' });
    expect(store.getCr('cr-002').iaRunId).toBe('run-ia-1');
  });

  it('sets patchRunId', () => {
    store.updateCrStatus('cr-002', { status: 'patching', patchRunId: 'run-patch-1', updatedAt: '2026-05-23T03:00:00.000Z' });
    expect(store.getCr('cr-002').patchRunId).toBe('run-patch-1');
  });

  it('sets regressionRunId', () => {
    store.updateCrStatus('cr-002', { status: 'regression_running', regressionRunId: 'run-reg-1', updatedAt: '2026-05-23T04:00:00.000Z' });
    expect(store.getCr('cr-002').regressionRunId).toBe('run-reg-1');
  });
});

describe('listCrs', () => {
  it('listCrs() returns all CRs ordered by created_at DESC', () => {
    store.createCr(makeCr({ id: 'cr-a', createdAt: '2026-05-23T01:00:00.000Z', updatedAt: '2026-05-23T01:00:00.000Z' }));
    store.createCr(makeCr({ id: 'cr-b', createdAt: '2026-05-23T02:00:00.000Z', updatedAt: '2026-05-23T02:00:00.000Z' }));
    const list = store.listCrs();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe('cr-b');
    expect(list[1].id).toBe('cr-a');
  });

  it('listCrs(projectName) returns only that project CRs', () => {
    db.prepare('INSERT INTO projects (name, root_path, phase, updated_at) VALUES (?, ?, ?, ?)')
      .run('other-project', 'E:/projects/other', 'build', '2026-05-23T00:00:00.000Z');
    store.createCr(makeCr({ id: 'cr-p1', projectName: PROJECT_NAME }));
    store.createCr(makeCr({ id: 'cr-p2', projectName: 'other-project' }));
    const list = store.listCrs(PROJECT_NAME);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('cr-p1');
  });

  it('listCrs() with no args returns all projects CRs', () => {
    db.prepare('INSERT INTO projects (name, root_path, phase, updated_at) VALUES (?, ?, ?, ?)')
      .run('other-project', 'E:/projects/other', 'build', '2026-05-23T00:00:00.000Z');
    store.createCr(makeCr({ id: 'cr-p1', projectName: PROJECT_NAME }));
    store.createCr(makeCr({ id: 'cr-p2', projectName: 'other-project' }));
    expect(store.listCrs()).toHaveLength(2);
  });
});

describe('upsertCrDocument / getCrDocument', () => {
  beforeEach(() => { store.createCr(makeCr()); });

  it('inserts document and getCrDocument returns it', () => {
    store.upsertCrDocument('cr-001', 'impact_analysis', '/doc/ia.md', 'summary text');
    const doc = store.getCrDocument('cr-001', 'impact_analysis');
    expect(doc).not.toBeNull();
    expect(doc.crId).toBe('cr-001');
    expect(doc.docType).toBe('impact_analysis');
    expect(doc.path).toBe('/doc/ia.md');
    expect(doc.contentSummary).toBe('summary text');
  });

  it('second call with same crId+docType updates path and summary', () => {
    store.upsertCrDocument('cr-001', 'impact_analysis', '/doc/ia.md', 'old summary');
    store.upsertCrDocument('cr-001', 'impact_analysis', '/doc/ia-v2.md', 'new summary');
    const doc = store.getCrDocument('cr-001', 'impact_analysis');
    expect(doc.path).toBe('/doc/ia-v2.md');
    expect(doc.contentSummary).toBe('new summary');
    const cnt = db.prepare("SELECT COUNT(*) AS c FROM cr_documents WHERE cr_id='cr-001' AND doc_type='impact_analysis'").get();
    expect(cnt.c).toBe(1);
  });

  it('different docTypes coexist', () => {
    store.upsertCrDocument('cr-001', 'impact_analysis', '/doc/ia.md', 'ia');
    store.upsertCrDocument('cr-001', 'patch_plan', '/doc/patch.md', 'patch');
    expect(store.getCrDocument('cr-001', 'impact_analysis')).not.toBeNull();
    expect(store.getCrDocument('cr-001', 'patch_plan')).not.toBeNull();
  });

  it('getCrDocument returns null for missing docType', () => {
    expect(store.getCrDocument('cr-001', 'nonexistent')).toBeNull();
  });
});

describe('createRegressionResult / getLatestRegressionResult', () => {
  beforeEach(() => { store.createCr(makeCr()); });

  it('inserts regression result and getLatestRegressionResult returns it', () => {
    store.createRegressionResult({
      crId: 'cr-001', runId: 'run-reg-1', status: 'pass',
      totalTests: 10, passedTests: 10, failedTests: 0,
      reportPath: '/reports/reg-1.html',
      createdAt: '2026-05-23T05:00:00.000Z'
    });
    const r = store.getLatestRegressionResult('cr-001');
    expect(r).not.toBeNull();
    expect(r.crId).toBe('cr-001');
    expect(r.runId).toBe('run-reg-1');
    expect(r.status).toBe('pass');
    expect(r.totalTests).toBe(10);
    expect(r.passedTests).toBe(10);
    expect(r.failedTests).toBe(0);
    expect(r.reportPath).toBe('/reports/reg-1.html');
  });

  it('getLatestRegressionResult returns the most recent result', () => {
    store.createRegressionResult({
      crId: 'cr-001', runId: 'run-reg-1', status: 'fail',
      totalTests: 10, passedTests: 8, failedTests: 2,
      reportPath: '/reports/reg-1.html',
      createdAt: '2026-05-23T05:00:00.000Z'
    });
    store.createRegressionResult({
      crId: 'cr-001', runId: 'run-reg-2', status: 'pass',
      totalTests: 10, passedTests: 10, failedTests: 0,
      reportPath: '/reports/reg-2.html',
      createdAt: '2026-05-23T06:00:00.000Z'
    });
    const r = store.getLatestRegressionResult('cr-001');
    expect(r.runId).toBe('run-reg-2');
  });

  it('getLatestRegressionResult returns null when no results', () => {
    expect(store.getLatestRegressionResult('cr-001')).toBeNull();
  });
});

describe('cascade delete', () => {
  it('deleting a CR cascades to cr_documents and regression_results', () => {
    store.createCr(makeCr());
    store.upsertCrDocument('cr-001', 'impact_analysis', '/doc/ia.md', 'summary');
    store.createRegressionResult({
      crId: 'cr-001', runId: 'run-reg-1', status: 'pass',
      totalTests: 5, passedTests: 5, failedTests: 0,
      reportPath: '/reports/reg-1.html',
      createdAt: '2026-05-23T05:00:00.000Z'
    });

    db.prepare("DELETE FROM change_requests WHERE id = 'cr-001'").run();

    const doc = db.prepare("SELECT * FROM cr_documents WHERE cr_id = 'cr-001'").get();
    const reg = db.prepare("SELECT * FROM regression_results WHERE cr_id = 'cr-001'").get();
    expect(doc).toBeUndefined();
    expect(reg).toBeUndefined();
  });
});