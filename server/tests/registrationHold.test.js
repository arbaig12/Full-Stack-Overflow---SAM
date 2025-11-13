/**
 * @file registrationHold.test.js
 * @description Integration tests for the Registration Hold concept's API routes.
 * This file uses Vitest for the test runner and Supertest for making HTTP requests
 * to the Express application. The database interactions are mocked to ensure
 * fast and isolated testing of the API layer and its interaction with the model.
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import registrationHoldRoutes from '../concepts/registrationHold/registrationHoldRoutes.js';

/**
 * @function buildApp
 * @description Helper function to create a new Express app instance for testing.
 * It sets up middleware and mounts the registration hold routes, injecting a mock database query function.
 * @param {Function} queryImpl - A mock implementation for `req.db.query`.
 * @returns {express.Application} A configured Express application for testing.
 */
function buildApp(queryImpl) {
  const app = express();
  app.use(express.json()); // Enable JSON body parsing
  // Inject mock database connection into the request object
  app.use((req, _res, next) => { req.db = { query: queryImpl }; next(); });
  app.use('/api/registration-holds', registrationHoldRoutes); // Mount the routes
  return app;
}

/**
 * @describe Registration Hold Routes
 * @description Test suite for the API endpoints related to managing student registration holds.
 * Verifies the correct behavior of GET, POST, and DELETE operations.
 */
describe('Registration Hold Routes', () => {
  /**
   * @it GET /api/registration-holds/:studentId returns holds for a student
   * @description Verifies that the GET endpoint correctly retrieves and returns
   * all registration holds associated with a given student ID.
   * It mocks a successful database query and asserts the HTTP status and response body.
   */
  it('GET /api/registration-holds/:studentId returns holds for a student', async () => {
    const rows = [
      { hold_id: 1, student_id: 1, hold_type: 'Academic', note: 'Test hold' }
    ];
    // Mock the database query to return predefined rows
    const query = vi.fn().mockResolvedValue({ rows });
    const app = buildApp(query);

    const res = await request(app).get('/api/registration-holds/1');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.holds).toEqual(rows);
    expect(query).toHaveBeenCalledTimes(1); // Ensure the database query was made
  });

  /**
   * @it POST /api/registration-holds places a hold on a student
   * @description Verifies that the POST endpoint successfully places a new registration hold
   * on a student's account. It mocks the database insertion and checks for a 201 Created status
   * and the returned hold data.
   */
  it('POST /api/registration-holds places a hold on a student', async () => {
    const newHold = { student_id: 1, hold_type: 'Financial', note: 'Test financial hold' };
    const rows = [
      { hold_id: 2, ...newHold }
    ];
    // Mock the database query to simulate an insertion
    const query = vi.fn().mockResolvedValue({ rows });
    const app = buildApp(query);

    const res = await request(app).post('/api/registration-holds').send(newHold);

    expect(res.status).toBe(201); // Expect 201 Created
    expect(res.body.ok).toBe(true);
    expect(res.body.hold).toEqual(rows[0]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  /**
   * @it DELETE /api/registration-holds/:holdId removes a hold
   * @description Verifies that the DELETE endpoint successfully removes an existing
   * registration hold from a student's account. It mocks the database deletion and
   * asserts the HTTP status and success message.
   */
  it('DELETE /api/registration-holds/:holdId removes a hold', async () => {
    // Mock the database query to simulate a deletion
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = buildApp(query);

    const res = await request(app).delete('/api/registration-holds/1');

    expect(res.status).toBe(200); // Expect 200 OK
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toBe('Hold removed successfully');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
