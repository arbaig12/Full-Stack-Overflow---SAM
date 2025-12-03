import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import importDegreeReq from '../routes/importDegreeReq.js';

function buildApp(queryImpl) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = { query: queryImpl }; next(); });
  app.use('/api/import', importDegreeReq);
  return app;
}

describe('Import Degree Requirements', () => {
  describe('POST /api/import/degree-requirements', () => {
    it('requires file upload', async () => {
      const app = buildApp(vi.fn());
      const res = await request(app)
        .post('/api/import/degree-requirements');

      expect(res.status).toBe(400);
    });

    it('validates YAML format', async () => {
      const app = buildApp(vi.fn());
      const res = await request(app)
        .post('/api/import/degree-requirements')
        .attach('file', Buffer.from('invalid yaml'), 'test.yaml');

      expect([400, 500]).toContain(res.status);
    });
  });
});

