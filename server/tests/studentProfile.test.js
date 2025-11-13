/**
 * @file studentProfile.test.js
 * @description Integration tests for the Student Profile concept's API routes.
 * This file uses Vitest for the test runner and Supertest for making HTTP requests
 * to the Express application. The database interactions are extensively mocked to
 * simulate various student data scenarios and ensure accurate profile aggregation
 * and calculation.
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import studentProfileRoutes from '../concepts/studentProfile/studentProfileRoutes.js';

/**
 * @function buildApp
 * @description Helper function to create a new Express app instance for testing.
 * It sets up middleware and mounts the student profile routes, injecting a mock database query function.
 * @param {Function} queryImpl - A mock implementation for `req.db.query`. This function will be called
 *   multiple times by the `getStudentProfile` model, so it should be configured to return different
 *   values based on the call order or arguments.
 * @returns {express.Application} A configured Express application for testing.
 */
function buildApp(queryImpl) {
  const app = express();
  app.use(express.json()); // Enable JSON body parsing
  // Inject mock database connection into the request object
  app.use((req, _res, next) => { req.db = { query: queryImpl }; next(); });
  app.use('/api/student-profile', studentProfileRoutes); // Mount the routes
  return app;
}

/**
 * @describe GET /api/student-profile/:userId
 * @description Test suite for the API endpoint that retrieves a comprehensive student profile.
 * This suite covers various scenarios including successful retrieval, credit-based calculations,
 * handling of non-existent users, and database errors.
 */
describe('GET /api/student-profile/:userId', () => {
  /**
   * @it returns the student profile for a valid user ID
   * @description Verifies that the endpoint successfully retrieves and aggregates all
   * necessary data to form a complete student profile for a valid user ID.
   * It mocks multiple database calls for user info, classes, holds, waivers, and programs.
   * Asserts the HTTP status, response structure, and calculated fields like GPA and class standing.
   */
  it('returns the student profile for a valid user ID', async () => {
    // Mock data for various database queries
    const userRows = [
      {
        user_id: 1, sbu_id: '123456789', first_name: 'John', last_name: 'Doe',
        email: 'john.doe@stonybrook.edu', role: 'Student', university_entry: { semester: 'Fall', year: 2020 },
        direct_admit: null, aoi: 'CSE', college: 'CEAS'
      }
    ];
    const classRows = [
      { class_id: 1, subject: 'CSE', course_num: '101', credits: 3, grade: 'A', semester: 'Fall', year: 2020 },
      { class_id: 2, subject: 'MAT', course_num: '125', credits: 3, grade: 'B', semester: 'Fall', year: 2020 },
    ];
    const holdRows = [
      { hold_id: 1, student_id: 1, hold_type: 'Academic', note: 'Test hold' }
    ];
    const waiverRows = [
      { waiver_id: 1, student_id: 1, waiver_type: 'Prerequisite', note: 'Test waiver' }
    ];
    const programRows = [
      { program_id: 1, subject: 'CSE', degree_type: 'BS', program_type: 'Major', major_requirement_version: 'Fall 2020' }
    ];

    // Configure the mock query function to return different data for sequential calls
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: userRows })      // First call: user data
      .mockResolvedValueOnce({ rows: classRows })     // Second call: classes data
      .mockResolvedValueOnce({ rows: holdRows })      // Third call: holds data
      .mockResolvedValueOnce({ rows: waiverRows })    // Fourth call: waivers data
      .mockResolvedValueOnce({ rows: programRows });  // Fifth call: programs data

    const app = buildApp(query);

    const res = await request(app).get('/api/student-profile/1');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.profile).toEqual({
      user_id: 1, sbu_id: '123456789', first_name: 'John', last_name: 'Doe',
      email: 'john.doe@stonybrook.edu', role: 'Student', university_entry: { semester: 'Fall', year: 2020 },
      direct_admit: null, aoi: 'CSE', college: 'CEAS',
      classes: classRows,
      class_standing: 'U1', // Based on 6 credits and default graduation_requirements.yaml
      cumulativeGpa: 3.5,   // (4.0*3 + 3.0*3) / 6 = 3.5
      termGpa: { 'Fall 2020': 3.5 },
      cumulativeCredits: 6,
      registration_holds: holdRows,
      waivers: waiverRows,
      academic_programs: programRows,
    });

    expect(query).toHaveBeenCalledTimes(5); // Verify all expected DB calls were made
    // Optionally, verify specific arguments passed to mock calls
    expect(query.mock.calls[0][1]).toEqual([1]); // user query
    expect(query.mock.calls[1][1]).toEqual([1]); // classes query
    expect(query.mock.calls[2][1]).toEqual([1]); // holds query
    expect(query.mock.calls[3][1]).toEqual([1]); // waivers query
    expect(query.mock.calls[4][1]).toEqual([1]); // programs query
  });

  /**
   * @it returns U2 for a student with 30 credits
   * @description Verifies that the class standing calculation correctly identifies a student
   * with 30 credits as 'U2' (Sophomore), based on the `graduation_requirements.yaml` thresholds.
   * It also checks cumulative GPA and credits.
   */
  it('returns U2 for a student with 30 credits', async () => {
    const userRows = [
      {
        user_id: 1, sbu_id: '123456789', first_name: 'John', last_name: 'Doe',
        email: 'john.doe@stonybrook.edu', role: 'Student', university_entry: { semester: 'Fall', year: 2020 },
        direct_admit: null, aoi: 'CSE', college: 'CEAS'
      }
    ];
    // Simulate 10 classes, each 3 credits, all 'A' grades = 30 credits
    const classRows2 = Array(10).fill(null).map((_, i) => ({
      class_id: i, subject: 'CSE', course_num: '101', credits: 3, grade: 'A', semester: 'Fall', year: 2020
    }));
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: userRows })
      .mockResolvedValueOnce({ rows: classRows2 })
      .mockResolvedValueOnce({ rows: [] }) // No holds
      .mockResolvedValueOnce({ rows: [] }) // No waivers
      .mockResolvedValueOnce({ rows: [] }); // No programs
    const app = buildApp(query);

    const res = await request(app).get('/api/student-profile/1');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.profile.class_standing).toBe('U2'); // Expect U2 for 30 credits
    expect(res.body.profile.cumulativeGpa).toBe(4.0);
    expect(res.body.profile.cumulativeCredits).toBe(30);
  });

  /**
   * @it returns 404 for a non-existent user ID
   * @description Verifies that the endpoint correctly handles requests for a user ID
   * that does not exist in the database, returning a 404 Not Found status.
   */
  it('returns 404 for a non-existent user ID', async () => {
    // Mock the user query to return no rows
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = buildApp(query);

    const res = await request(app).get('/api/student-profile/999');

    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('Student not found');
  });

  /**
   * @it handles DB errors with 500
   * @description Verifies that the endpoint gracefully handles unexpected database errors
   * during profile retrieval, returning a 500 Internal Server Error status.
   */
  it('handles DB errors with 500', async () => {
    // Mock the database query to throw an error
    const query = vi.fn().mockRejectedValue(new Error('boom'));
    const app = buildApp(query);

    const res = await request(app).get('/api/student-profile/1');

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBeDefined();
  });
});
