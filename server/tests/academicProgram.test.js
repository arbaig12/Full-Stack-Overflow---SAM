import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import academicProgramRoutes from '../concepts/academicProgram/academicProgramRoutes.js';

function buildApp(queryImpl) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = { query: queryImpl }; next(); });
  app.use('/api/academic-programs', academicProgramRoutes);
  return app;
}

describe('Academic Program Routes', () => {
  it('GET /api/academic-programs/:studentId returns programs for a student', async () => {
    const rows = [
      { program_id: 1, subject: 'CSE', degree_type: 'BS', program_type: 'Major', major_requirement_version: 'Fall 2020' }
    ];
    const query = vi.fn().mockResolvedValue({ rows });
    const app = buildApp(query);

    const res = await request(app).get('/api/academic-programs/1');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.programs).toEqual(rows);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('POST /api/academic-programs declares a program for a student', async () => {
    const newProgram = { student_id: 1, program_id: 2, major_requirement_version: 'Fall 2022' };
    const rows = [
      { ...newProgram }
    ];
    const query = vi.fn().mockResolvedValue({ rows });
    const app = buildApp(query);

    const res = await request(app).post('/api/academic-programs').send(newProgram);

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.program).toEqual(rows[0]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('PUT /api/academic-programs/:programId updates a program for a student', async () => {
    const updatedProgram = { major_requirement_version: 'Fall 2023' };
    const rows = [
      { student_id: 1, program_id: 1, ...updatedProgram }
    ];
    const query = vi.fn().mockResolvedValue({ rows });
    const app = buildApp(query);

    const res = await request(app).put('/api/academic-programs/1').send(updatedProgram);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.program).toEqual(rows[0]);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
