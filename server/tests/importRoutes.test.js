import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import importRoutes from '../routes/importRoutes.js';
import fs from 'fs';
import path from 'path';

// Mock fs and path
vi.mock('fs');
vi.mock('path');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { 
    req.db = { 
      query: vi.fn().mockResolvedValue({ rows: [] })
    }; 
    next(); 
  });
  app.use('/api/import', importRoutes);
  return app;
}

describe('Import Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/import/catalog', () => {
    it('validates request parameters', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/import/catalog')
        .send({});

      expect(res.status).toBe(400);
    });

    it('validates subjects array', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/import/catalog')
        .send({ term: 'Fall2025', subjects: [] });

      expect(res.status).toBe(400);
    });

    it('prevents duplicate imports', async () => {
      const mockExistsSync = vi.fn().mockReturnValue(true);
      fs.existsSync = mockExistsSync;
      
      const app = buildApp();
      const res = await request(app)
        .post('/api/import/catalog')
        .send({ term: 'Fall2025', subjects: ['CSE'] });

      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/import/users', () => {
    it('requires file upload', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/import/users');

      expect(res.status).toBe(400);
    });

    it('validates YAML format', async () => {
      const mockReadFileSync = vi.fn().mockReturnValue('invalid yaml: [');
      fs.readFileSync = mockReadFileSync;
      
      const app = buildApp();
      const res = await request(app)
        .post('/api/import/users')
        .attach('file', Buffer.from('test'), 'test.yaml');

      // Should handle YAML parse error
      expect([400, 500]).toContain(res.status);
    });
  });
});

