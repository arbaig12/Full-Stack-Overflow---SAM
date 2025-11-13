/**
 * @file auditLog.test.js
 * @description Integration tests for the Audit Log concept's API routes.
 * This file uses Vitest for the test runner and Supertest for making HTTP requests
 * to the Express application. Database interactions are mocked to isolate API logic.
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import auditLogRoutes from '../concepts/auditLog/auditLogRoutes.js';

/**
 * @function buildApp
 * @description Helper function to create a new Express app instance for testing.
 * It sets up middleware and mounts the audit log routes, injecting a mock database query function.
 * @param {Function} queryImpl - A mock implementation for `req.db.query`.
 * @returns {express.Application} A configured Express application for testing.
 */
function buildApp(queryImpl) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = { query: queryImpl }; next(); });
  app.use('/api/audit-log', auditLogRoutes);
  return app;
}

describe('Audit Log API', () => {
  const mockUserId = 1;
  const mockLogEntry = {
    log_id: 1,
    user_id: mockUserId,
    action_type: 'CREATE',
    entity_type: 'User',
    entity_id: 2,
    old_value: null,
    new_value: { id: 2, name: 'New User' },
    change_details: 'User created',
    timestamp: new Date().toISOString(),
  };

  describe('POST /api/audit-log', () => {
    it('should log an action', async () => {
      const query = vi.fn().mockResolvedValueOnce({ rows: [mockLogEntry] });
      const app = buildApp(query);
      const res = await request(app)
        .post('/api/audit-log')
        .send({
          user_id: mockUserId,
          action_type: 'CREATE',
          entity_type: 'User',
          entity_id: 2,
          new_value: { id: 2, name: 'New User' },
          change_details: 'User created',
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.logEntry).toEqual(mockLogEntry);
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('should return 500 if database operation fails', async () => {
      const query = vi.fn().mockRejectedValue(new Error('DB error'));
      const app = buildApp(query);
      const res = await request(app)
        .post('/api/audit-log')
        .send({
          user_id: mockUserId,
          action_type: 'CREATE',
          entity_type: 'User',
          entity_id: 2,
          new_value: { id: 2, name: 'New User' },
          change_details: 'User created',
        });

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/audit-log', () => {
    it('should retrieve audit log entries', async () => {
      const mockLogEntries = [mockLogEntry];
      const query = vi.fn().mockResolvedValueOnce({ rows: mockLogEntries });
      const app = buildApp(query);
      const res = await request(app).get('/api/audit-log');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.logEntries).toEqual(mockLogEntries);
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('should retrieve audit log entries with filters', async () => {
      const mockLogEntries = [mockLogEntry];
      const query = vi.fn().mockResolvedValueOnce({ rows: mockLogEntries });
      const app = buildApp(query);
      const res = await request(app).get('/api/audit-log?user_id=1&action_type=CREATE');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.logEntries).toEqual(mockLogEntries);
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0][1]).toEqual([1, 'CREATE']); // Verify filters are passed
    });

    it('should return an empty array if no entries match filters', async () => {
      const query = vi.fn().mockResolvedValueOnce({ rows: [] });
      const app = buildApp(query);
      const res = await request(app).get('/api/audit-log?user_id=999');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.logEntries).toEqual([]);
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('should return 500 if database operation fails', async () => {
      const query = vi.fn().mockRejectedValue(new Error('DB error'));
      const app = buildApp(query);
      const res = await request(app).get('/api/audit-log');

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBeDefined();
    });
  });
});
