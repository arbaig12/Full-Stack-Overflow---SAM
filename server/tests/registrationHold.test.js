import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import registrationHoldRoutes from '../concepts/registrationHold/registrationHoldRoutes.js';

function buildApp(queryImpl) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = { query: queryImpl }; next(); });
  app.use('/api/registration-holds', registrationHoldRoutes);
  return app;
}

describe('Registration Hold Routes', () => {
  it('GET /api/registration-holds/:studentId returns holds for a student', async () => {
    const rows = [
      { hold_id: 1, student_id: 1, hold_type: 'Academic', note: 'Test hold' }
    ];
    const query = vi.fn().mockResolvedValue({ rows });
    const app = buildApp(query);

    const res = await request(app).get('/api/registration-holds/1');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.holds).toEqual(rows);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('POST /api/registration-holds places a hold on a student', async () => {
    const newHold = { student_id: 1, hold_type: 'Financial', note: 'Test financial hold' };
    const rows = [
      { hold_id: 2, ...newHold }
    ];
    const query = vi.fn().mockResolvedValue({ rows });
    const app = buildApp(query);

    const res = await request(app).post('/api/registration-holds').send(newHold);

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.hold).toEqual(rows[0]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('DELETE /api/registration-holds/:holdId removes a hold', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = buildApp(query);

    const res = await request(app).delete('/api/registration-holds/1');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toBe('Hold removed successfully');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
