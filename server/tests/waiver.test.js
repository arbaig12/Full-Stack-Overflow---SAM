import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import waiverRoutes from '../concepts/waiver/waiverRoutes.js';

function buildApp(queryImpl) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = { query: queryImpl }; next(); });
  app.use('/api/waivers', waiverRoutes);
  return app;
}

describe('Waiver Routes', () => {
  it('GET /api/waivers/:studentId returns waivers for a student', async () => {
    const rows = [
      { waiver_id: 1, student_id: 1, waiver_type: 'Prerequisite', note: 'Test waiver' }
    ];
    const query = vi.fn().mockResolvedValue({ rows });
    const app = buildApp(query);

    const res = await request(app).get('/api/waivers/1');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.waivers).toEqual(rows);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('POST /api/waivers creates a waiver for a student', async () => {
    const newWaiver = { student_id: 1, waiver_type: 'Time Conflict', note: 'Test time conflict waiver' };
    const rows = [
      { waiver_id: 2, ...newWaiver }
    ];
    const query = vi.fn().mockResolvedValue({ rows });
    const app = buildApp(query);

    const res = await request(app).post('/api/waivers').send(newWaiver);

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.waiver).toEqual(rows[0]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('DELETE /api/waivers/:waiverId revokes a waiver', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = buildApp(query);

    const res = await request(app).delete('/api/waivers/1');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toBe('Waiver revoked successfully');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
