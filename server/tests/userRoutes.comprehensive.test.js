import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import usersRoutes from '../routes/userRoutes.js';

function buildApp(queryImpl) {
  const app = express();
  app.use(express.json());
  const queryFn = typeof queryImpl === 'function' ? queryImpl : () => queryImpl;
  app.use((req, _res, next) => { req.db = { query: queryFn }; next(); });
  app.use('/api/user-management', usersRoutes);
  return app;
}

describe('User Routes - Comprehensive', () => {
  describe('GET /api/users/search', () => {
    it('searches users by name', async () => {
      const rows = [{
        user_id: 1,
        sbu_id: '123456789',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@stonybrook.edu',
        role: 'Student'
      }];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/user-management/search?name=John');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('searches users by role', async () => {
      const rows = [];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/user-management/search?role=Student');

      expect(res.status).toBe(200);
    });

    it('searches students by major', async () => {
      const rows = [];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/user-management/search?role=Student&major=CSE');

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/users/export/:sbu_id', () => {
    it('handles export request for existing user', async () => {
      const rows = [{
        user_id: 1,
        sbu_id: '123456789',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@stonybrook.edu',
        role: 'Student'
      }];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/user-management/123456789/export');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('yaml');
    });

    it('returns 404 for non-existent user', async () => {
      const query = vi.fn().mockResolvedValue({ rows: [] });
      const app = buildApp(query);

      const res = await request(app).get('/api/users/export/999');

      expect(res.status).toBe(404);
    });

    it('returns 404 for non-existent user', async () => {
      const query = vi.fn().mockResolvedValue({ rows: [] });
      const app = buildApp(query);

      const res = await request(app).get('/api/users/export/999');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/users/students', () => {
    it('returns all students', async () => {
      const rows = [{
        user_id: 1,
        sbu_id: '123456789',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@stonybrook.edu',
        role: 'Student',
        status: 'active',
        last_login_fmt: '2025-08-01',
        student_user_id: 1,
        standing: 'U2',
        department_name: 'Computer Science'
      }];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/user-management/students');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.users).toHaveLength(1);
    });
  });

  describe('GET /api/users/instructors', () => {
    it('returns all instructors', async () => {
      const rows = [{
        user_id: 1,
        sbu_id: '987654321',
        first_name: 'Dr. Smith',
        last_name: 'Professor',
        email: 'smith@stonybrook.edu',
        role: 'Instructor',
        status: 'active',
        last_login_fmt: '2025-08-01',
        department_id: 1,
        department_name: 'Computer Science',
        courses: ['CSE114', 'CSE214']
      }];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/user-management/instructors');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.users).toHaveLength(1);
    });
  });

  describe('GET /api/users/advisors', () => {
    it('returns all advisors', async () => {
      const rows = [{
        user_id: 1,
        sbu_id: '111222333',
        first_name: 'Advisor',
        last_name: 'Name',
        email: 'advisor@stonybrook.edu',
        role: 'Advisor',
        status: 'active',
        last_login_fmt: '2025-08-01',
        level: 'department',
        department_id: 1,
        department_name: 'Computer Science',
        college_id: 1,
        college_name: 'CEAS'
      }];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/user-management/advisors');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});

