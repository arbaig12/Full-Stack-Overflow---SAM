import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import courseCatalogRoutes from '../routes/courseCatalogRoutes.js';

function buildApp(queryImpl) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = { query: queryImpl }; next(); });
  app.use('/api/catalog', courseCatalogRoutes);
  return app;
}

describe('Course Catalog Routes', () => {
  describe('GET /api/catalog/courses', () => {
    it('returns courses with all fields including prerequisites and SBCs', async () => {
      const rows = [
        {
          course_id: 1,
          subject: 'CSE',
          course_num: '114',
          title: 'Introduction to Object-Oriented Programming',
          description: 'OOP concepts',
          credits: 3,
          department_id: 1,
          department_name: 'Computer Science',
          department_code: 'CSE',
          catalog_term_id: 1,
          catalog_semester: 'Fall',
          catalog_year: 2025,
          prerequisites: 'CSE 101',
          corequisites: '',
          anti_requisites: '',
          advisory_prerequisites: '',
          sbc: 'TECH'
        }
      ];
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // catalog check
        .mockResolvedValueOnce({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/catalog/courses?term_id=1');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.courses).toHaveLength(1);
      expect(res.body.courses[0]).toMatchObject({
        courseId: 1,
        subject: 'CSE',
        courseNum: '114',
        prerequisites: 'CSE 101',
        sbc: 'TECH',
        classieEvalsUrl: 'https://classie-evals.stonybrook.edu/?SearchKeyword=CSE114&SearchTerm=ALL'
      });
    });

    it('filters by subject', async () => {
      const rows = [];
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/catalog/courses?term_id=1&subject=CSE');

      expect(res.status).toBe(200);
      expect(query).toHaveBeenCalled();
    });

    it('filters by SBC', async () => {
      const rows = [];
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/catalog/courses?term_id=1&sbc=TECH');

      expect(res.status).toBe(200);
    });

    it('uses nearest term catalog when requested term not available', async () => {
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // no catalog for term
        .mockResolvedValueOnce({ rows: [{ year: 2025, semester: 'Fall' }] }) // get requested term
        .mockResolvedValueOnce({ rows: [{ catalog_term_id: 2 }] }) // find nearest
        .mockResolvedValueOnce({ rows: [] }); // return courses
      const app = buildApp(query);

      const res = await request(app).get('/api/catalog/courses?term_id=999');

      expect(res.status).toBe(200);
      expect(query).toHaveBeenCalledTimes(4);
    });

    it('handles database errors', async () => {
      const query = vi.fn().mockRejectedValue(new Error('DB error'));
      const app = buildApp(query);

      const res = await request(app).get('/api/catalog/courses?term_id=1');

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });
  });

  describe('GET /api/catalog/courses/:course_id', () => {
    it('returns course details with all requirement fields', async () => {
      const rows = [{
        course_id: 1,
        subject: 'CSE',
        course_num: '214',
        title: 'Data Structures',
        description: 'Advanced data structures',
        credits: 3,
        department_id: 1,
        department_name: 'Computer Science',
        department_code: 'CSE',
        catalog_term_id: 1,
        catalog_semester: 'Fall',
        catalog_year: 2025,
        prerequisites: 'CSE 114',
        corequisites: '',
        anti_requisites: '',
        advisory_prerequisites: '',
        sbc: 'TECH'
      }];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/catalog/courses/1');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.course).toMatchObject({
        courseId: 1,
        prerequisites: 'CSE 114',
        sbc: 'TECH',
        classieEvalsUrl: 'https://classie-evals.stonybrook.edu/?SearchKeyword=CSE214&SearchTerm=ALL'
      });
    });

    it('returns 404 for non-existent course', async () => {
      const query = vi.fn().mockResolvedValue({ rows: [] });
      const app = buildApp(query);

      const res = await request(app).get('/api/catalog/courses/999');

      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
    });
  });

  describe('GET /api/catalog/courses/:course_id/sections', () => {
    it('returns sections with meeting days and times', async () => {
      const rows = [{
        class_id: 1,
        section_num: '01',
        capacity: 30,
        enrolled_count: '25',
        location_text: 'Engineering 101',
        requires_dept_permission: false,
        notes: null,
        instructor_id: 1,
        instructor_name: 'Dr. Smith',
        instructor_email: 'smith@stonybrook.edu',
        building: 'Engineering',
        room: '101',
        room_capacity: 30,
        meeting_days: 'Tue,Thu',
        meeting_times: '2:00-3:20 PM'
      }];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/catalog/courses/1/sections?term_id=1');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.sections[0]).toMatchObject({
        meetingDays: 'Tue,Thu',
        meetingTimes: '2:00-3:20 PM'
      });
    });

    it('requires term_id parameter', async () => {
      const app = buildApp(vi.fn());
      const res = await request(app).get('/api/catalog/courses/1/sections');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/catalog/subjects', () => {
    it('returns all available subjects', async () => {
      const rows = [
        { subject: 'CSE', department_name: 'Computer Science' },
        { subject: 'AMS', department_name: 'Applied Mathematics' }
      ];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/catalog/subjects');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.subjects).toHaveLength(2);
    });
  });
});

