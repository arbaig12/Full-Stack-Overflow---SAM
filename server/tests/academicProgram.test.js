/**
 * @file academicProgram.test.js
 * @description Integration tests for the Academic Program concept's API routes.
 * This file uses Vitest for the test runner and Supertest for making HTTP requests
 * to the Express application. The database interactions are mocked to ensure
 * fast and isolated testing of the API layer and its interaction with the model.
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import academicProgramRoutes from '../concepts/academicProgram/academicProgramRoutes.js';

/**
 * @function buildApp
 * @description Helper function to create a new Express app instance for testing.
 * It sets up middleware and mounts the academic program routes, injecting a mock database query function.
 * @param {Function} queryImpl - A mock implementation for `req.db.query`.
 * @returns {express.Application} A configured Express application for testing.
 */
function buildApp(queryImpl) {
  const app = express();
  app.use(express.json()); // Enable JSON body parsing
  // Inject mock database connection into the request object
  app.use((req, _res, next) => { req.db = { query: queryImpl }; return next(); });
  app.use('/api/academic-programs', academicProgramRoutes); // Mount the routes
  return app;
}

/**
 * @describe Academic Program Routes
 * @description Test suite for the API endpoints related to managing student academic programs.
 * Verifies the correct behavior of GET, POST, and PUT operations.
 */
describe('Academic Program Routes', () => {
  /**
   * @it GET /api/academic-programs/:studentId returns programs for a student
   * @description Verifies that the GET endpoint correctly retrieves and returns
   * all academic programs associated with a given student ID.
   * It mocks a successful database query and asserts the HTTP status and response body.
   */
  it('GET /api/academic-programs/:studentId returns programs for a student', async () => {
    const rows = [
      { program_id: 1, subject: 'CSE', degree_type: 'BS', program_type: 'Major', major_requirement_version: 'Fall 2020' }
    ];
    // Mock the database query to return predefined rows
    const query = vi.fn().mockResolvedValue({ rows });
    const app = buildApp(query);

    const res = request(app).get('/api/academic-programs/1');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.programs).toEqual(rows);
    expect(query).toHaveBeenCalledTimes(1); // Ensure the database query was made
  });

  /**
   * @it POST /api/academic-programs declares a program for a student
   * @description Verifies that the POST endpoint successfully declares a new academic program
   * for a student. It mocks the database insertion and checks for a 201 Created status
   * and the returned program data.
   */
  it('POST /api/academic-programs declares a program for a student', async () => {
    const newProgram = { student_id: 1, program_id: 2, major_requirement_version: 'Fall 2022' };
    const rows = [
      { ...newProgram }
    ];
    // Mock the database query to simulate an insertion
    const query = vi.fn().mockResolvedValue({ rows });
    const app = buildApp(query);

    const res = await request(app).post('/api/academic-programs').send(newProgram);

    expect(res.status).toBe(201); // Expect 201 Created
    expect(res.body.ok).toBe(true);
    expect(res.body.program).toEqual(rows[0]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  /**
   * @it PUT /api/academic-programs/:programId updates a program for a student
   * @description Verifies that the PUT endpoint correctly updates an existing academic program
   * for a student. It mocks the database update and asserts the HTTP status and updated program data.
   */
  it('PUT /api/academic-programs/:programId updates a program for a student', async () => {
    const updatedProgram = { major_requirement_version: 'Fall 2023' };
    const rows = [
      { student_id: 1, program_id: 1, ...updatedProgram }
    ];
    // Mock the database query to simulate an update
    const query = vi.fn().mockResolvedValue({ rows });
    const app = buildApp(query);

    const res = await request(app).put('/api/academic-programs/1').send(updatedProgram);

    expect(res.status).toBe(200); // Expect 200 OK
    expect(res.body.ok).toBe(true);
    expect(res.body.program).toEqual(rows[0]);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
