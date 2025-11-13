/**
 * @file waiver.test.js
 * @description Integration tests for the Waiver concept's API routes.
 * This file uses Vitest for the test runner and Supertest for making HTTP requests
 * to the Express application. The database interactions are mocked to ensure
 * fast and isolated testing of the API layer and its interaction with the model.
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import waiverRoutes from '../concepts/waiver/waiverRoutes.js';

/**
 * @function buildApp
 * @description Helper function to create a new Express app instance for testing.
 * It sets up middleware and mounts the waiver routes, injecting a mock database query function.
 * @param {Function} queryImpl - A mock implementation for `req.db.query`.
 * @returns {express.Application} A configured Express application for testing.
 */
function buildApp(queryImpl) {
  const app = express();
  app.use(express.json()); // Enable JSON body parsing
  // Inject mock database connection into the request object
  app.use((req, _res, next) => { req.db = { query: queryImpl }; next(); });
  app.use('/api/waivers', waiverRoutes); // Mount the routes
  return app;
}

/**
 * @describe Waiver Routes
 * @description Test suite for the API endpoints related to managing student academic waivers.
 * Verifies the correct behavior of GET, POST, and DELETE operations.
 */
describe('Waiver Routes', () => {
  /**
   * @it GET /api/waivers/:studentId returns waivers for a student
   * @description Verifies that the GET endpoint correctly retrieves and returns
   * all academic waivers associated with a given student ID.
   * It mocks a successful database query and asserts the HTTP status and response body.
   */
  it('GET /api/waivers/:studentId returns waivers for a student', async () => {
    const rows = [
      { waiver_id: 1, student_id: 1, waiver_type: 'Prerequisite', note: 'Test waiver' }
    ];
    // Mock the database query to return predefined rows
    const query = vi.fn().mockResolvedValue({ rows });
    const app = buildApp(query);

    const res = await request(app).get('/api/waivers/1');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.waivers).toEqual(rows);
    expect(query).toHaveBeenCalledTimes(1); // Ensure the database query was made
  });

  /**
   * @it POST /api/waivers creates a waiver for a student
   * @description Verifies that the POST endpoint successfully creates a new academic waiver
   * for a student. It mocks the database insertion and checks for a 201 Created status
   * and the returned waiver data.
   */
  it('POST /api/waivers creates a waiver for a student', async () => {
    const newWaiver = { student_id: 1, waiver_type: 'Time Conflict', note: 'Test time conflict waiver' };
    const rows = [
      { waiver_id: 2, ...newWaiver }
    ];
    // Mock the database query to simulate an insertion
    const query = vi.fn().mockResolvedValue({ rows });
    const app = buildApp(query);

    const res = await request(app).post('/api/waivers').send(newWaiver);

    expect(res.status).toBe(201); // Expect 201 Created
    expect(res.body.ok).toBe(true);
    expect(res.body.waiver).toEqual(rows[0]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  /**
   * @it DELETE /api/waivers/:waiverId revokes a waiver
   * @description Verifies that the DELETE endpoint successfully revokes (deletes) an existing
   * academic waiver. It mocks the database deletion and asserts the HTTP status and success message.
   */
  it('DELETE /api/waivers/:waiverId revokes a waiver', async () => {
    // Mock the database query to simulate a deletion
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = buildApp(query);

    const res = await request(app).delete('/api/waivers/1');

    expect(res.status).toBe(200); // Expect 200 OK
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toBe('Waiver revoked successfully');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
