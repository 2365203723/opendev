const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { openDatabase } = require('../src/db');
const { createStore } = require('../src/store');
const { createApp } = require('../src/app');

let tmpDir;
let db;
let app;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hierarchy-runtime-api-test-'));
  db = openDatabase(path.join(tmpDir, 'test.db'));
  const store = createStore(db);
  app = createApp({
    config: {
      version: 'test',
      projectsDir: path.join(tmpDir, 'projects'),
      logsDir: path.join(tmpDir, 'logs'),
      lessonsDir: path.join(tmpDir, 'lessons'),
      claudeAssetsDir: tmpDir
    },
    store,
    indexer: { rebuild: () => ({ indexedProjects: 0, errors: [] }) },
    runner: null,
    watcherFactory: null
  });
});

afterEach(() => {
  if (typeof app.close === 'function') app.close();
  if (db) db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function createProduct(name = 'Test Product') {
  const res = await request(app).post('/api/products').send({ name }).expect(201);
  return res.body;
}

async function createMilestone(productId, name = 'MVP') {
  const res = await request(app).post(`/api/products/${productId}/milestones`).send({ name }).expect(201);
  return res.body;
}

async function createWorkstream(milestoneId, name = 'Auth System', extra = {}) {
  const res = await request(app).post(`/api/milestones/${milestoneId}/workstreams`).send({ name, ...extra }).expect(201);
  return res.body;
}

async function createTask(workstreamId, title = 'Implement login') {
  const res = await request(app).post(`/api/workstreams/${workstreamId}/tasks`).send({ title, agentRole: 'backend' }).expect(201);
  return res.body;
}

describe('Runtime hierarchy API', () => {
  it('creates and lists products through the main app', async () => {
    await createProduct('Product A');
    await createProduct('Product B');

    const res = await request(app).get('/api/products').expect(200);

    expect(res.body.products).toHaveLength(2);
    expect(res.body.products.map(product => product.name)).toEqual(['Product B', 'Product A']);
  });

  it('updates and deletes a product through the main app', async () => {
    const product = await createProduct('Old Name');

    const updated = await request(app)
      .patch(`/api/products/${product.id}`)
      .send({ name: 'New Name', status: 'active' })
      .expect(200);

    expect(updated.body.product.name).toBe('New Name');
    expect(updated.body.product.status).toBe('active');

    await request(app).delete(`/api/products/${product.id}`).expect(204);
    await request(app).get(`/api/products/${product.id}`).expect(404);
  });

  it('creates and lists milestones through the main app', async () => {
    const product = await createProduct();
    await createMilestone(product.id, 'M1');
    await createMilestone(product.id, 'M2');

    const res = await request(app).get(`/api/products/${product.id}/milestones`).expect(200);

    expect(res.body.milestones).toHaveLength(2);
  });

  it('blocks releasing a milestone while a child workstream is blocked', async () => {
    const product = await createProduct();
    const milestone = await createMilestone(product.id);
    await createWorkstream(milestone.id, 'Blocked Workstream', { status: 'blocked' });

    const res = await request(app)
      .patch(`/api/milestones/${milestone.id}`)
      .send({ status: 'released' })
      .expect(400);

    expect(res.body.error).toContain('blocked');
  });

  it('updates and deletes workstreams and tasks through the main app', async () => {
    const product = await createProduct();
    const milestone = await createMilestone(product.id);
    const workstream = await createWorkstream(milestone.id, 'Auth');
    const task = await createTask(workstream.id, 'Implement login');

    const updatedWorkstream = await request(app)
      .patch(`/api/workstreams/${workstream.id}`)
      .send({ status: 'in_progress', ownerRole: 'backend' })
      .expect(200);
    expect(updatedWorkstream.body.workstream.status).toBe('in_progress');

    const updatedTask = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ status: 'todo', priority: 'high' })
      .expect(200);
    expect(updatedTask.body.task.status).toBe('todo');
    expect(updatedTask.body.task.priority).toBe('high');

    await request(app).delete(`/api/tasks/${task.id}`).expect(204);
    const tasks = await request(app).get(`/api/workstreams/${workstream.id}/tasks`).expect(200);
    expect(tasks.body.tasks).toHaveLength(0);

    await request(app).delete(`/api/workstreams/${workstream.id}`).expect(204);
    const workstreams = await request(app).get(`/api/milestones/${milestone.id}/workstreams`).expect(200);
    expect(workstreams.body.workstreams).toHaveLength(0);
  });

  it('returns a product tree with milestones, workstreams, tasks, and gates', async () => {
    const product = await createProduct('Product A');
    const milestone = await createMilestone(product.id, 'M1');
    const workstream = await createWorkstream(milestone.id, 'W1');
    await createTask(workstream.id, 'T1');
    await createTask(workstream.id, 'T2');
    await request(app).post('/api/gates').send({ scopeType: 'milestone', scopeId: milestone.id, gateName: 'Gate A', status: 'pass' }).expect(201);
    await request(app).post('/api/gates').send({ scopeType: 'workstream', scopeId: workstream.id, gateName: 'Gate B', status: 'pending' }).expect(201);

    const res = await request(app).get(`/api/products/${product.id}/tree`).expect(200);

    expect(res.body.product.name).toBe('Product A');
    expect(res.body.product.milestones).toHaveLength(1);
    expect(res.body.product.milestones[0].gates).toHaveLength(1);
    expect(res.body.product.milestones[0].workstreams).toHaveLength(1);
    expect(res.body.product.milestones[0].workstreams[0].gates).toHaveLength(1);
    expect(res.body.product.milestones[0].workstreams[0].tasks).toHaveLength(2);
  });

  it('records and queries gates through the main app generic gate API', async () => {
    await request(app).post('/api/gates').send({
      scopeType: 'milestone',
      scopeId: 'm1',
      gateName: 'Gate A',
      status: 'pass',
      evidencePath: '/evidence'
    }).expect(201);

    const res = await request(app).get('/api/gates?scopeType=milestone&scopeId=m1').expect(200);

    expect(res.body.gates).toHaveLength(1);
    expect(res.body.gates[0].gateName).toBe('Gate A');
    expect(res.body.gates[0].status).toBe('pass');
  });
});
