import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import academicCalendarRoutes from '../routes/academicCalendarRoutes.js';

function buildApp(queryImpl) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = { query: queryImpl }; next(); });
  app.use('/api/calendar', academicCalendarRoutes);
  return app;
}

describe('Academic Calendar Routes', () => {
  describe('GET /api/calendar/terms', () => {
    it('returns all terms', async () => {
      const rows = [{
        term_id: 1,
        semester: 'Fall',
        year: 2025,
        reg_start_date: '2025-08-01',
        reg_end_date: '2025-08-31',
        add_drop_deadline: '2025-09-15',
        withdraw_deadline: '2025-11-01',
        declare_start_date: '2025-07-01',
        declare_end_date: '2025-08-15',
        instruction_start: '2025-08-26',
        instruction_end: '2025-12-15',
        finals_start: '2025-12-16',
        finals_end: '2025-12-22'
      }];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/calendar/terms');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.terms).toHaveLength(1);
    });

    it('filters by year', async () => {
      const rows = [];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/calendar/terms?year=2025');

      expect(res.status).toBe(200);
    });

    it('filters by semester', async () => {
      const rows = [];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/calendar/terms?semester=Fall');

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/calendar/terms/current', () => {
    it('returns current term using date wrapper', async () => {
      // Mock the date wrapper
      vi.doMock('../../utils/dateWrapper.js', () => ({
        getCurrentDate: () => new Date(2025, 8, 15) // September 15, 2025
      }));

      const rows = [{
        term_id: 1,
        semester: 'Fall',
        year: 2025,
        reg_start_date: '2025-08-01',
        reg_end_date: '2025-08-31',
        add_drop_deadline: '2025-09-15',
        withdraw_deadline: '2025-11-01',
        declare_start_date: '2025-07-01',
        declare_end_date: '2025-08-15',
        instruction_start: '2025-08-26',
        instruction_end: '2025-12-15',
        finals_start: '2025-12-16',
        finals_end: '2025-12-22'
      }];
      const query = vi.fn().mockResolvedValue({ rows });
      const app = buildApp(query);

      const res = await request(app).get('/api/calendar/terms/current');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('GET /api/calendar/academic-calendar/:term_id', () => {
    it('returns academic calendar for term', async () => {
      const termRows = [{ term_id: 1, semester: 'Fall', year: 2025 }];
      const calendarRows = [{
        id: 1,
        term: { semester: 'Fall', year: 2025 },
        major_and_minor_changes_begin: '2025-07-01',
        major_and_minor_changes_end: '2025-08-15',
        waitlist: true,
        waitlist_process_ends: '2025-08-20',
        late_registration_ends: '2025-09-05',
        GPNC_selection_ends: '2025-10-01',
        course_withdrawal_ends: '2025-11-01',
        advanced_registration_begins: '2025-07-01',
        semester_end: '2025-12-22'
      }];
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: termRows })
        .mockResolvedValueOnce({ rows: calendarRows });
      const app = buildApp(query);

      const res = await request(app).get('/api/calendar/academic-calendar/1');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.calendar).toBeDefined();
    });

    it('returns 404 for non-existent term', async () => {
      const query = vi.fn().mockResolvedValue({ rows: [] });
      const app = buildApp(query);

      const res = await request(app).get('/api/calendar/academic-calendar/999');

      expect(res.status).toBe(404);
    });
  });
});

