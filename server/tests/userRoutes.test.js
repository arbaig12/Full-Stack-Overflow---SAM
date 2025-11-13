/**
 * @file userRoutes.test.js
 * @description Integration tests for the User concept's API routes, specifically focusing
 * on the `/registrars` endpoint. This file uses Vitest for the test runner and Supertest
 * for making HTTP requests to the Express application. The database interactions are
 * mocked to ensure fast and isolated testing of the API layer and its interaction with the model.
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import usersRoutes from '../concepts/user/userRoutes.js';

/**
 * @function buildApp
 * @description Helper function to create a new Express app instance for testing.
 * It sets up middleware and mounts the user routes, injecting a mock database query function.
 * @param {Function} queryImpl - A mock implementation for `req.db.query`.
 * @returns {express.Application} A configured Express application for testing.
 */
function buildApp(queryImpl) {
  const app = express();
  app.use(express.json()); // Enable JSON body parsing
  // Inject mock database connection into the request object
  app.use((req, _res, next) => { req.db = { query: queryImpl }; next(); });
  app.use('/api/users', usersRoutes); // Mount the routes
  return app;
}

/**
 * @describe GET /api/users/registrars
 * @description Test suite for the API endpoint that retrieves a list of registrars.
 * This suite covers successful data retrieval and error handling.
 */
describe('GET /api/users/registrars', () => {
  /**
   * @it returns registrars mapped for the UI
   * @description Verifies that the endpoint successfully retrieves users with the 'Registrar' role
   * and maps their data into the expected UI-friendly format.
   * It mocks a successful database query and asserts the HTTP status, response body structure,
   * and the number of returned users.
   */
  it('returns registrars mapped for the UI', async () => {
    const rows = [
      {
        user_id: 2,
        sbu_id: '2',
        first_name: 'DataBase',
        last_name: 'TestUser',
        email: 'admin@stonybrook.edu',
        role: 'Registrar'
      }
    ];
    // Mock the database query to return predefined registrar data
    const query = vi.fn().mockResolvedValue({ rows });
    const app = buildApp(query);

    const res = request(app).get('/api/users/registrars');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.users).toHaveLength(1);

    // Assert the structure and content of the mapped user object
    expect(res.body.users[0]).toEqual({
      id: '2',
      name: 'DataBase TestUser',
      email: 'admin@stonybrook.edu',
      role: 'registrar',
      status: 'active',
      lastLogin: null,
      department: 'Administration'
    });

    expect(query).toHaveBeenCalledTimes(1); // Ensure the database query was made
    // Verify the arguments passed to the mock query
    const [_sql, params] = query.mock.calls[0];
    expect(params).toEqual(['Registrar']);
  });

  /**
   * @it handles DB errors with 500
   * @description Verifies that the endpoint gracefully handles unexpected database errors
   * during registrar retrieval, returning a 500 Internal Server Error status.
   */
  it('handles DB errors with 500', async () => {
    // Mock the database query to throw an error
    const query = vi.fn().mockRejectedValue(new Error('boom'));
    const app = buildApp(query);

    const res = request(app).get('/api/users/registrars');

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBeDefined();
  });
});
