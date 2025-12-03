import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import usersRoutes from '../routes/userRoutes.js';


function buildApp(queryImpl) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = { query: queryImpl }; next(); });
  app.use('/api/users', usersRoutes);
  return app;
}

describe('GET /api/users/registrars', () => {
  it('returns registrars mapped for the UI', async () => {
    const rows = [
      {
        user_id: 2,
        sbu_id: '2',
        first_name: 'DataBase',
        last_name: 'TestUser',
        email: 'admin@stonybrook.edu',
        role: 'Registrar',
        status: 'active',
        last_login_fmt: null
      }
    ];
    const query = vi.fn().mockResolvedValue({ rows });
    const app = buildApp(query);

    const res = await request(app).get('/api/users/registrars');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.users).toHaveLength(1);

    expect(res.body.users[0]).toEqual({
      id: '2',
      name: 'DataBase TestUser',
      email: 'admin@stonybrook.edu',
      role: 'registrar',
      status: 'active',
      lastLogin: null,
      department: 'Administration'
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [_sql, params] = query.mock.calls[0];
    expect(params).toEqual(['Registrar']);
  });

  it('handles DB errors with 500', async () => {
    const query = vi.fn().mockRejectedValue(new Error('boom'));
    const app = buildApp(query);

    const res = await request(app).get('/api/users/registrars');

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBeDefined();
  });
});
