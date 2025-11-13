import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import studentProfileRoutes from '../concepts/studentProfile/studentProfileRoutes.js';

function buildApp(queryImpl) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = { query: queryImpl }; next(); });
  app.use('/api/student-profile', studentProfileRoutes);
  return app;
}

describe('GET /api/student-profile/:userId', () => {
  it('returns the student profile for a valid user ID', async () => {
    const userRows = [
      {
        user_id: 1,
        sbu_id: '123456789',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john.doe@stonybrook.edu',
        role: 'Student',
        university_entry: { semester: 'Fall', year: 2020 },
        direct_admit: null,
        aoi: 'CSE',
        college: 'CEAS'
      }
    ];
    const classRows = [
      { class_id: 1, subject: 'CSE', course_num: '101', credits: 3, grade: 'A', semester: 'Fall', year: 2020 },
      { class_id: 2, subject: 'MAT', course_num: '125', credits: 3, grade: 'B', semester: 'Fall', year: 2020 },
    ];
    const holdRows = [
      { hold_id: 1, student_id: 1, hold_type: 'Academic', note: 'Test hold' }
    ];
    const waiverRows = [
      { waiver_id: 1, student_id: 1, waiver_type: 'Prerequisite', note: 'Test waiver' }
    ];
    const programRows = [
      { program_id: 1, subject: 'CSE', degree_type: 'BS', program_type: 'Major', major_requirement_version: 'Fall 2020' }
    ];
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: userRows })
      .mockResolvedValueOnce({ rows: classRows })
      .mockResolvedValueOnce({ rows: holdRows })
      .mockResolvedValueOnce({ rows: waiverRows })
      .mockResolvedValueOnce({ rows: programRows });
    const app = buildApp(query);

    const res = await request(app).get('/api/student-profile/1');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.profile).toEqual({
      user_id: 1,
      sbu_id: '123456789',
      first_name: 'John',
      last_name: 'Doe',
      email: 'john.doe@stonybrook.edu',
      role: 'Student',
      university_entry: { semester: 'Fall', year: 2020 },
      direct_admit: null,
      aoi: 'CSE',
      college: 'CEAS',
      classes: classRows,
      class_standing: 'U1',
      cumulativeGpa: 3.5,
      termGpa: { 'Fall 2020': 3.5 },
      cumulativeCredits: 6,
      registration_holds: holdRows,
      waivers: waiverRows,
      academic_programs: programRows,
    });

    expect(query).toHaveBeenCalledTimes(5);
    const [userSql, userParams] = query.mock.calls[0];
    expect(userParams).toEqual([ 1 ]);
    const [classSql, classParams] = query.mock.calls[1];
    expect(classParams).toEqual([ 1 ]);
    const [holdSql, holdParams] = query.mock.calls[2];
    expect(holdParams).toEqual([ 1 ]);
    const [waiverSql, waiverParams] = query.mock.calls[3];
    expect(waiverParams).toEqual([ 1 ]);
    const [programSql, programParams] = query.mock.calls[4];
    expect(programParams).toEqual([ 1 ]);
  });

  it('returns U2 for a student with 30 credits', async () => {
    const userRows = [
      {
        user_id: 1,
        sbu_id: '123456789',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john.doe@stonybrook.edu',
        role: 'Student',
        university_entry: { semester: 'Fall', year: 2020 },
        direct_admit: null,
        aoi: 'CSE',
        college: 'CEAS'
      }
    ];
    const classRows2 = Array(10).fill(null).map((_, i) => ({
      class_id: i,
      subject: 'CSE',
      course_num: '101',
      credits: 3,
      grade: 'A',
      semester: 'Fall',
      year: 2020
    }));
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: userRows })
      .mockResolvedValueOnce({ rows: classRows2 })
      .mockResolvedValueOnce({ rows: [] }) // No holds
      .mockResolvedValueOnce({ rows: [] }) // No waivers
      .mockResolvedValueOnce({ rows: [] }); // No programs
    const app = buildApp(query);

    const res = await request(app).get('/api/student-profile/1');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.profile.class_standing).toBe('U2');
    expect(res.body.profile.cumulativeGpa).toBe(4.0);
    expect(res.body.profile.cumulativeCredits).toBe(30);
  });

  it('returns 404 for a non-existent user ID', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = buildApp(query);

    const res = await request(app).get('/api/student-profile/999');

    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('Student not found');
  });

  it('handles DB errors with 500', async () => {
    const query = vi.fn().mockRejectedValue(new Error('boom'));
    const app = buildApp(query);

    const res = await request(app).get('/api/student-profile/1');

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBeDefined();
  });
});
