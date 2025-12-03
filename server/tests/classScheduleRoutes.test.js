import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import classScheduleRoutes from '../routes/classScheduleRoutes.js';

function buildApp(queryImpl) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = { query: queryImpl }; next(); });
  app.use('/api/schedule', classScheduleRoutes);
  return app;
}

describe('Class Schedule Routes', () => {
  describe('GET /api/schedule/sections', () => {
    it('returns sections with meeting days, times, and SBC', async () => {
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
        description: 'OOP concepts',
        sbc: 'TECH',
        meeting_days: 'Tue,Thu',
        meeting_times: '2:00-3:20 PM',
        instructor_id: 1,
        instructor_name: 'Dr. Smith',
        instructor_email: 'smith@stonybrook.edu',
        building: 'Engineering',
        room: '101',
        location_text: null
      }];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/schedule/sections?term_id=1');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.sections[0]).toMatchObject({
        sbc: 'TECH',
        meetingDays: 'Tue,Thu',
        meetingTimes: '2:00-3:20 PM'
      });
    });

    it('filters by SBC', async () => {
      const rows = [];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/schedule/sections?term_id=1&sbc=TECH');

      expect(res.status).toBe(200);
    });

    it('filters by days of week', async () => {
      const rows = [];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/schedule/sections?term_id=1&days=Tue,Thu');

      expect(res.status).toBe(200);
    });

    it('requires term_id', async () => {
      const app = buildApp(vi.fn());
      const res = await request(app).get('/api/schedule/sections');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/schedule/sections/:class_id', () => {
    it('returns section details with meeting info', async () => {
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
        description: 'OOP concepts',
        sbc: 'TECH',
        meeting_days: 'Tue,Thu',
        meeting_times: '2:00-3:20 PM',
        instructor_id: 1,
        instructor_name: 'Dr. Smith',
        instructor_email: 'smith@stonybrook.edu',
        building: 'Engineering',
        room: '101',
        location_text: null,
        term_id: 1,
        semester: 'Fall',
        year: 2025
      }];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/schedule/sections/1');

      expect(res.status).toBe(200);
      expect(res.body.section).toMatchObject({
        sbc: 'TECH',
        meetingDays: 'Tue,Thu',
        meetingTimes: '2:00-3:20 PM'
      });
    });

    it('returns 404 for non-existent section', async () => {
      const query = vi.fn().mockResolvedValue({ rows: [] });
      const app = buildApp(query);

      const res = await request(app).get('/api/schedule/sections/999');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/schedule/enrollments', () => {
    it('enrolls student in course', async () => {
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ capacity: 30, term_id: 1, course_id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '25' }] })
        .mockResolvedValueOnce({ rows: [] });
      const app = buildApp(query);

      const res = await request(app)
        .post('/api/schedule/enrollments')
        .send({ student_id: 1, class_id: 1 });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });

    it('adds to waitlist when class is full', async () => {
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ capacity: 30, term_id: 1, course_id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '30' }] })
        .mockResolvedValueOnce({ rows: [] });
      const app = buildApp(query);

      const res = await request(app)
        .post('/api/schedule/enrollments')
        .send({ student_id: 1, class_id: 1 });

      expect(res.status).toBe(201);
      expect(res.body.waitlisted).toBe(true);
    });

    it('requires student_id and class_id', async () => {
      const app = buildApp(vi.fn());
      const res = await request(app)
        .post('/api/schedule/enrollments')
        .send({ student_id: 1 });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/schedule/enrollments/:student_id/:class_id', () => {
    it('withdraws student from course', async () => {
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ status: 'registered' }] })
        .mockResolvedValueOnce({ rows: [] });
      const app = buildApp(query);

      const res = await request(app).delete('/api/schedule/enrollments/1/1');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('returns 404 if enrollment not found', async () => {
      const query = vi.fn().mockResolvedValue({ rows: [] });
      const app = buildApp(query);

      const res = await request(app).delete('/api/schedule/enrollments/1/999');

      expect(res.status).toBe(404);
    });
  });
});

