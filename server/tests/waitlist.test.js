/**
 * @file waitlist.test.js
 * @description Integration tests for the Waitlist concept's API routes.
 * This file uses Vitest for the test runner and Supertest for making HTTP requests
 * to the Express application. Database interactions are mocked to isolate API logic.
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import waitlistRoutes from '../concepts/waitlist/waitlistRoutes.js';

/**
 * @function buildApp
 * @description Helper function to create a new Express app instance for testing.
 * It sets up middleware and mounts the waitlist routes, injecting a mock database query function.
 * @param {Function} queryImpl - A mock implementation for `req.db.query`.
 * @returns {express.Application} A configured Express application for testing.
 */
function buildApp(queryImpl) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = { query: queryImpl }; next(); });
  app.use('/api/waitlists', waitlistRoutes);
  return app;
}

describe('Waitlist API', () => {
  const mockStudentUserId = 1;
  const mockClassSectionId = 101;

  describe('POST /api/waitlists', () => {
    it('should add a student to the waitlist', async () => {
      const mockWaitlistEntry = {
        waitlist_entry_id: 1,
        student_user_id: mockStudentUserId,
        class_section_id: mockClassSectionId,
        position: 1,
        joined_at: new Date().toISOString(),
      };
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ next_position: 1 }] }) // For position calculation
        .mockResolvedValueOnce({ rows: [mockWaitlistEntry] }); // For insert

      const app = buildApp(query);
      const res = await request(app)
        .post('/api/waitlists')
        .send({ student_user_id: mockStudentUserId, class_section_id: mockClassSectionId });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.entry).toEqual(mockWaitlistEntry);
      expect(query).toHaveBeenCalledTimes(2);
    });

    it('should return 500 if database operation fails', async () => {
      const query = vi.fn().mockRejectedValue(new Error('DB error'));
      const app = buildApp(query);
      const res = await request(app)
        .post('/api/waitlists')
        .send({ student_user_id: mockStudentUserId, class_section_id: mockClassSectionId });

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('DELETE /api/waitlists/:waitlistEntryId', () => {
    it('should remove a student from the waitlist', async () => {
      const mockWaitlistEntryId = 1;
      const query = vi.fn().mockResolvedValueOnce({ rowCount: 1 }); // Simulate successful deletion
      const app = buildApp(query);
      const res = await request(app).delete(`/api/waitlists/${mockWaitlistEntryId}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.message).toBe('Waitlist entry removed successfully');
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('should return 500 if database operation fails', async () => {
      const mockWaitlistEntryId = 1;
      const query = vi.fn().mockRejectedValue(new Error('DB error'));
      const app = buildApp(query);
      const res = await request(app).delete(`/api/waitlists/${mockWaitlistEntryId}`);

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/waitlists/class/:classSectionId', () => {
    it('should retrieve the waitlist for a class', async () => {
      const mockWaitlist = [
        { waitlist_entry_id: 1, student_user_id: 1, first_name: 'John', last_name: 'Doe', class_section_id: mockClassSectionId, position: 1, joined_at: new Date().toISOString() },
        { waitlist_entry_id: 2, student_user_id: 2, first_name: 'Jane', last_name: 'Smith', class_section_id: mockClassSectionId, position: 2, joined_at: new Date().toISOString() },
      ];
      const query = vi.fn().mockResolvedValueOnce({ rows: mockWaitlist });
      const app = buildApp(query);
      const res = await request(app).get(`/api/waitlists/class/${mockClassSectionId}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.waitlist).toEqual(mockWaitlist);
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('should return an empty array if waitlist is empty', async () => {
      const query = vi.fn().mockResolvedValueOnce({ rows: [] });
      const app = buildApp(query);
      const res = await request(app).get(`/api/waitlists/class/${mockClassSectionId}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.waitlist).toEqual([]);
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('should return 500 if database operation fails', async () => {
      const query = vi.fn().mockRejectedValue(new Error('DB error'));
      const app = buildApp(query);
      const res = await request(app).get(`/api/waitlists/class/${mockClassSectionId}`);

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/waitlists/class/:classSectionId/next', () => {
    it('should retrieve the next student on the waitlist', async () => {
      const mockNextStudent = { waitlist_entry_id: 1, student_user_id: 1, class_section_id: mockClassSectionId, position: 1, joined_at: new Date().toISOString() };
      const query = vi.fn().mockResolvedValueOnce({ rows: [mockNextStudent] });
      const app = buildApp(query);
      const res = await request(app).get(`/api/waitlists/class/${mockClassSectionId}/next`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.nextStudent).toEqual(mockNextStudent);
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('should return null if waitlist is empty', async () => {
      const query = vi.fn().mockResolvedValueOnce({ rows: [] });
      const app = buildApp(query);
      const res = await request(app).get(`/api/waitlists/class/${mockClassSectionId}/next`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.nextStudent).toBeNull();
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('should return 500 if database operation fails', async () => {
      const query = vi.fn().mockRejectedValue(new Error('DB error'));
      const app = buildApp(query);
      const res = await request(app).get(`/api/waitlists/class/${mockClassSectionId}/next`);

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBeDefined();
    });
  });
});
