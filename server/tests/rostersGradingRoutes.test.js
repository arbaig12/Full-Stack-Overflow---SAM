import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import rostersGradingRoutes from '../routes/rostersGradingRoutes.js';

function buildApp(queryImpl) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = { query: queryImpl, connect: vi.fn().mockResolvedValue({ query: queryImpl, release: vi.fn() }) }; next(); });
  app.use('/api/rosters', rostersGradingRoutes);
  return app;
}

describe('Rosters and Grading Routes', () => {
  describe('GET /api/rosters/instructors/:instructor_id/sections', () => {
    it('returns instructor sections', async () => {
      const rows = [{
        class_id: 1,
        section_num: '01',
        capacity: 30,
        enrolled_count: '25',
        course_id: 1,
        subject: 'CSE',
        course_num: '114',
        title: 'OOP',
        credits: 3,
        term_id: 1,
        semester: 'Fall',
        year: 2025,
        location_text: 'Engineering 101'
      }];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/rosters/instructors/1/sections');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.sections).toHaveLength(1);
    });
  });

  describe('GET /api/rosters/sections/:class_id/roster', () => {
    it('returns class roster', async () => {
      const sectionRows = [{ class_id: 1, instructor_id: 1 }];
      const rosterRows = [{
        student_id: 1,
        enrollment_status: 'registered',
        grade: null,
        gpnc: false,
        credits: 3,
        added_at: '2025-08-01',
        sbu_id: '123456789',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john.doe@stonybrook.edu'
      }];
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: sectionRows })
        .mockResolvedValueOnce({ rows: rosterRows });
      const app = buildApp(query);

      const res = await request(app).get('/api/rosters/sections/1/roster');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.roster).toHaveLength(1);
    });

    it('returns 404 for non-existent section', async () => {
      const query = vi.fn().mockResolvedValue({ rows: [] });
      const app = buildApp(query);

      const res = await request(app).get('/api/rosters/sections/999/roster');

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/rosters/enrollments/:student_id/:class_id/grade', () => {
    it('submits a grade', async () => {
      const enrollmentRows = [{ class_id: 1 }];
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: enrollmentRows })
        .mockResolvedValueOnce({ rows: [] });
      const app = buildApp(query);

      const res = await request(app)
        .put('/api/rosters/enrollments/1/1/grade')
        .send({ grade: 'A' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('rejects invalid grade', async () => {
      const app = buildApp(vi.fn());
      const res = await request(app)
        .put('/api/rosters/enrollments/1/1/grade')
        .send({ grade: 'INVALID' });

      expect(res.status).toBe(400);
    });

    it('returns 404 if enrollment not found', async () => {
      const query = vi.fn().mockResolvedValue({ rows: [] });
      const app = buildApp(query);

      const res = await request(app)
        .put('/api/rosters/enrollments/1/999/grade')
        .send({ grade: 'A' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/rosters/sections/:class_id/grades', () => {
    it('bulk updates grades', async () => {
      const query = vi.fn().mockResolvedValue({ rows: [] });
      const app = buildApp(query);

      const res = await request(app)
        .post('/api/rosters/sections/1/grades')
        .send({ grades: [{ student_id: 1, grade: 'A' }, { student_id: 2, grade: 'B' }] });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('validates grades array', async () => {
      const app = buildApp(vi.fn());
      const res = await request(app)
        .post('/api/rosters/sections/1/grades')
        .send({ grades: [] });

      expect(res.status).toBe(400);
    });
  });
});

