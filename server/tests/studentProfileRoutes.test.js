import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import studentProfileRoutes from '../routes/studentProfileRoutes.js';

function buildApp(queryImpl) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = { query: queryImpl }; next(); });
  app.use('/api/students', studentProfileRoutes);
  return app;
}

describe('Student Profile Routes', () => {
  describe('GET /api/students/:student_id/profile', () => {
    it('returns student profile', async () => {
      const rows = [{
        user_id: 1,
        sbu_id: '123456789',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john.doe@stonybrook.edu',
        role: 'Student',
        status: 'active',
        standing: 'U2',
        expected_grad_term_id: 1,
        expected_grad_semester: 'Spring',
        expected_grad_year: 2027,
        direct_admit_program_id: null,
        aoi_program_id: null,
        direct_admit_code: null,
        direct_admit_name: null,
        aoi_code: null,
        aoi_name: null
      }];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/students/1/profile');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.profile).toMatchObject({
        userId: 1,
        sbuId: '123456789',
        firstName: 'John',
        lastName: 'Doe'
      });
    });

    it('returns 404 for non-existent student', async () => {
      const query = vi.fn().mockResolvedValue({ rows: [] });
      const app = buildApp(query);

      const res = await request(app).get('/api/students/999/profile');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/students/:student_id/transcript', () => {
    it('returns transcript with GPA calculation', async () => {
      const rows = [
        {
          class_id: 1,
          enrollment_status: 'registered',
          grade: 'A',
          gpnc: false,
          credits: 3,
          section_num: '01',
          term_id: 1,
          course_id: 1,
          subject: 'CSE',
          course_num: '114',
          title: 'OOP',
          course_credits: 3,
          semester: 'Fall',
          year: 2025
        },
        {
          class_id: 2,
          enrollment_status: 'registered',
          grade: 'B',
          gpnc: false,
          credits: 3,
          section_num: '01',
          term_id: 1,
          course_id: 2,
          subject: 'CSE',
          course_num: '214',
          title: 'Data Structures',
          course_credits: 3,
          semester: 'Fall',
          year: 2025
        }
      ];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/students/1/transcript');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.transcript).toHaveLength(2);
      expect(res.body.gpa).toBeDefined();
    });
  });

  describe('GET /api/students/:student_id/programs', () => {
    it('returns student declared programs', async () => {
      const rows = [{
        program_id: 1,
        program_kind: 'MAJOR',
        declared_at: '2025-08-01',
        code: 'CSE',
        name: 'Computer Science',
        program_type: 'MAJOR',
        department_id: 1,
        department_name: 'Computer Science',
        department_code: 'CSE'
      }];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/students/1/programs');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.programs).toHaveLength(1);
      expect(res.body.majors).toHaveLength(1);
    });
  });
});

