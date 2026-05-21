const request = require('supertest');
const { createApp } = require('../src/app');

describe('health API', () => {
  it('returns service status without touching project files', async () => {
    const app = createApp({
      store: null,
      indexer: null,
      runner: null,
      config: { version: '0.1.0' }
    });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      service: 'one-person-dev-company-control-plane',
      version: '0.1.0'
    });
  });
});
