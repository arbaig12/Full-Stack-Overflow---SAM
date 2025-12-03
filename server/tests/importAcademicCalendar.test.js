import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import importAcademicCalendar from '../routes/importAcademicCalendar.js';

function buildApp(queryImpl) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = { query: queryImpl }; next(); });
  app.use('/api/import', importAcademicCalendar);
  return app;
}

describe('Import Academic Calendar', () => {
  describe('POST /api/import/academic-calendar', () => {
    it('requires file upload', async () => {
      const app = buildApp(vi.fn());
      const res = await request(app)
        .post('/api/import/academic-calendar');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No file uploaded');
    });

    it('validates YAML structure', async () => {
      const app = buildApp(vi.fn());
      const res = await request(app)
        .post('/api/import/academic-calendar')
        .attach('file', Buffer.from('invalid: yaml'), 'test.yaml');

      expect(res.status).toBe(400);
    });

    it('validates term field', async () => {
      const yamlContent = `academic_calendar:
  term: {}
  major_and_minor_changes_begin: 2025-07-01`;
      
      const app = buildApp(vi.fn());
      const res = await request(app)
        .post('/api/import/academic-calendar')
        .attach('file', Buffer.from(yamlContent), 'test.yaml');

      expect(res.status).toBe(400);
    });

    it('prevents duplicate imports', async () => {
      const yamlContent = `academic_calendar:
  term:
    semester: Fall
    year: 2025
  major_and_minor_changes_begin: 2025-07-01`;
      
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Already exists
      
      const app = buildApp(query);
      const res = await request(app)
        .post('/api/import/academic-calendar')
        .attach('file', Buffer.from(yamlContent), 'test.yaml');

      expect(res.status).toBe(409);
    });
  });
});

