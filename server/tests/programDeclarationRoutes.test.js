import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import programDeclarationRoutes from '../routes/programDeclarationRoutes.js';

function buildApp(queryImpl) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = { query: queryImpl }; next(); });
  app.use('/api/programs', programDeclarationRoutes);
  return app;
}

describe('Program Declaration Routes', () => {
  describe('GET /api/programs/programs', () => {
    it('returns all programs', async () => {
      const rows = [{
        program_id: 1,
        code: 'CSE',
        name: 'Computer Science',
        program_type: 'MAJOR',
        is_active: true,
        department_id: 1,
        department_name: 'Computer Science',
        department_code: 'CSE'
      }];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/programs/programs');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.programs).toHaveLength(1);
    });

    it('filters by type', async () => {
      const rows = [];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/programs/programs?type=MAJOR');

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/programs/students/:student_id/declare', () => {
    it('declares a major successfully', async () => {
      const programRows = [{ program_id: 1, type: 'MAJOR' }];
      const countRows = [{ major_count: '0', minor_count: '0' }];
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: programRows })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: countRows })
        .mockResolvedValueOnce({ rows: [] });
      const app = buildApp(query);

      const res = await request(app)
        .post('/api/programs/students/1/declare')
        .send({ program_id: 1, kind: 'MAJOR' });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });

    it('rejects when max majors reached', async () => {
      const programRows = [{ program_id: 1, type: 'MAJOR' }];
      const countRows = [{ major_count: '2', minor_count: '0' }];
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: programRows })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: countRows });
      const app = buildApp(query);

      const res = await request(app)
        .post('/api/programs/students/1/declare')
        .send({ program_id: 1, kind: 'MAJOR' });

      expect(res.status).toBe(409);
    });

    it('requires program_id and kind', async () => {
      const app = buildApp(vi.fn());
      const res = await request(app)
        .post('/api/programs/students/1/declare')
        .send({ program_id: 1 });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/programs/students/:student_id/declare/:program_id', () => {
    it('undeclares a program', async () => {
      const query = vi.fn().mockResolvedValue({ rows: [{ kind: 'MAJOR' }] });
      const app = buildApp(query);

      const res = await request(app).delete('/api/programs/students/1/declare/1');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('returns 404 if declaration not found', async () => {
      const query = vi.fn().mockResolvedValue({ rows: [] });
      const app = buildApp(query);

      const res = await request(app).delete('/api/programs/students/1/declare/999');

      expect(res.status).toBe(404);
    });
  });
});

