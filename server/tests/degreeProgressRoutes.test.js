import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import degreeProgressRoutes from '../routes/degreeProgressRoutes.js';

function buildApp(queryImpl) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = { query: queryImpl }; next(); });
  app.use('/api/degree', degreeProgressRoutes);
  return app;
}

describe('Degree Progress Routes', () => {
  describe('GET /api/degree/students/:student_id/degree-progress', () => {
    it('returns degree progress for student', async () => {
      const programsRows = [{
        program_id: 1,
        program_kind: 'MAJOR',
        code: 'CSE',
        name: 'Computer Science',
        program_type: 'MAJOR'
      }];
      const transcriptRows = [
        { subject: 'CSE', course_num: '114', credits: 3, grade: 'A', gpnc: false },
        { subject: 'CSE', course_num: '214', credits: 3, grade: 'B', gpnc: false }
      ];
      const reqRows = [{
        id: 1,
        subject: 'CSE',
        degree_type: 'BS',
        program_type: 'major',
        effective_term: { semester: 'Fall', year: 2024 },
        admission_requirements: { min_gpa: 3.2 },
        degree_requirements: { required_courses: ['CSE114', 'CSE214'] }
      }];
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: programsRows })
        .mockResolvedValueOnce({ rows: transcriptRows })
        .mockResolvedValueOnce({ rows: reqRows });
      const app = buildApp(query);

      const res = await request(app).get('/api/degree/students/1/degree-progress');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.programs).toBeDefined();
    });

    it('handles student with no programs', async () => {
      const query = vi.fn().mockResolvedValue({ rows: [] });
      const app = buildApp(query);

      const res = await request(app).get('/api/degree/students/1/degree-progress');

      expect(res.status).toBe(200);
      expect(res.body.programs).toEqual([]);
    });
  });

  describe('GET /api/degree/degree-requirements/:program_id', () => {
    it('returns degree requirements for program', async () => {
      const programRows = [{
        program_id: 1,
        code: 'CSE',
        name: 'Computer Science',
        program_type: 'MAJOR',
        department_code: 'CSE'
      }];
      const reqRows = [{
        id: 1,
        subject: 'CSE',
        degree_type: 'BS',
        program_type: 'major',
        effective_term: { semester: 'Fall', year: 2024 },
        admission_requirements: { min_gpa: 3.2 },
        degree_requirements: { required_courses: ['CSE114', 'CSE214'] }
      }];
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: programRows })
        .mockResolvedValueOnce({ rows: reqRows });
      const app = buildApp(query);

      const res = await request(app).get('/api/degree/degree-requirements/1');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.requirements).toBeDefined();
    });

    it('returns 404 for non-existent program', async () => {
      const query = vi.fn().mockResolvedValue({ rows: [] });
      const app = buildApp(query);

      const res = await request(app).get('/api/degree/degree-requirements/999');

      expect(res.status).toBe(404);
    });
  });
});

