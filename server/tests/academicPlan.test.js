/**
 * @file academicPlan.test.js
 * @description Integration tests for the Academic Plan concept's API routes.
 * This file uses Vitest for the test runner and Supertest for making HTTP requests
 * to the Express application. Database interactions are mocked to isolate API logic.
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import academicPlanRoutes from '../concepts/academicPlan/academicPlanRoutes.js';

/**
 * @function buildApp
 * @description Helper function to create a new Express app instance for testing.
 * It sets up middleware and mounts the academic plan routes, injecting a mock database query function.
 * @param {Function} queryImpl - A mock implementation for `req.db.query`.
 * @returns {express.Application} A configured Express application for testing.
 */
function buildApp(queryImpl) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = { query: queryImpl }; next(); });
  app.use('/api/academic-plans', academicPlanRoutes);
  return app;
}

describe('Academic Plan API', () => {
  const mockStudentUserId = 1;
  const mockPlanId = 101;
  const mockCourseId = 201;

  describe('POST /api/academic-plans', () => {
    it('should create a new academic plan', async () => {
      const mockPlan = {
        plan_id: mockPlanId,
        student_user_id: mockStudentUserId,
        plan_name: 'My Fall 2025 Plan',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        grad_term_semester: 'Spring',
        grad_term_year: 2027,
        workload_limits: { 'Fall 2025': 15 },
      };
      const query = vi.fn().mockResolvedValueOnce({ rows: [mockPlan] });
      const app = buildApp(query);
      const res = await request(app)
        .post('/api/academic-plans')
        .send({
          student_user_id: mockStudentUserId,
          plan_name: 'My Fall 2025 Plan',
          preferences: { grad_term_semester: 'Spring', grad_term_year: 2027, workload_limits: { 'Fall 2025': 15 } },
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.plan).toEqual(mockPlan);
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('should return 500 if database operation fails', async () => {
      const query = vi.fn().mockRejectedValue(new Error('DB error'));
      const app = buildApp(query);
      const res = await request(app)
        .post('/api/academic-plans')
        .send({ student_user_id: mockStudentUserId, plan_name: 'My Plan' });

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/academic-plans/:planId', () => {
    it('should retrieve an academic plan with its courses', async () => {
      const mockPlan = {
        plan_id: mockPlanId,
        student_user_id: mockStudentUserId,
        plan_name: 'My Fall 2025 Plan',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        grad_term_semester: 'Spring',
        grad_term_year: 2027,
        workload_limits: null,
      };
      const mockCourses = [
        { plan_course_id: 1, course_id: mockCourseId, subject: 'CSE', course_num: '101', name: 'Intro to CS', planned_term_semester: 'Fall', planned_term_year: 2025 },
      ];
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [mockPlan] })
        .mockResolvedValueOnce({ rows: mockCourses });
      const app = buildApp(query);
      const res = await request(app).get(`/api/academic-plans/${mockPlanId}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.plan).toEqual({ ...mockPlan, courses: mockCourses });
      expect(query).toHaveBeenCalledTimes(2);
    });

    it('should return 404 if plan is not found', async () => {
      const query = vi.fn().mockResolvedValueOnce({ rows: [] });
      const app = buildApp(query);
      const res = await request(app).get(`/api/academic-plans/${mockPlanId}`);

      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('Academic plan not found');
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('should return 500 if database operation fails', async () => {
      const query = vi.fn().mockRejectedValue(new Error('DB error'));
      const app = buildApp(query);
      const res = await request(app).get(`/api/academic-plans/${mockPlanId}`);

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('PUT /api/academic-plans/:planId', () => {
    it('should update an academic plan', async () => {
      const updatedPlan = {
        plan_id: mockPlanId,
        student_user_id: mockStudentUserId,
        plan_name: 'Updated Plan Name',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        grad_term_semester: 'Fall',
        grad_term_year: 2028,
        workload_limits: null,
      };
      const query = vi.fn().mockResolvedValueOnce({ rows: [updatedPlan] });
      const app = buildApp(query);
      const res = await request(app)
        .put(`/api/academic-plans/${mockPlanId}`)
        .send({ planName: 'Updated Plan Name', grad_term_semester: 'Fall', grad_term_year: 2028 });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.plan.plan_name).toBe('Updated Plan Name');
      expect(res.body.plan.grad_term_year).toBe(2028);
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('should return 404 if plan is not found', async () => {
      const query = vi.fn().mockResolvedValueOnce({ rows: [] });
      const app = buildApp(query);
      const res = await request(app)
        .put(`/api/academic-plans/${mockPlanId}`)
        .send({ planName: 'Non Existent' });

      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('Academic plan not found');
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('should return 500 if database operation fails', async () => {
      const query = vi.fn().mockRejectedValue(new Error('DB error'));
      const app = buildApp(query);
      const res = await request(app)
        .put(`/api/academic-plans/${mockPlanId}`)
        .send({ planName: 'Error Plan' });

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('DELETE /api/academic-plans/:planId', () => {
    it('should delete an academic plan', async () => {
      const query = vi.fn().mockResolvedValueOnce({ rowCount: 1 });
      const app = buildApp(query);
      const res = await request(app).delete(`/api/academic-plans/${mockPlanId}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.message).toBe('Academic plan deleted successfully');
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('should return 500 if database operation fails', async () => {
      const query = vi.fn().mockRejectedValue(new Error('DB error'));
      const app = buildApp(query);
      const res = await request(app).delete(`/api/academic-plans/${mockPlanId}`);

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('POST /api/academic-plans/:planId/courses', () => {
    it('should add a course to an academic plan', async () => {
      const mockCourseEntry = {
        plan_course_id: 1,
        plan_id: mockPlanId,
        course_id: mockCourseId,
        planned_term_semester: 'Fall',
        planned_term_year: 2025,
      };
      const query = vi.fn().mockResolvedValueOnce({ rows: [mockCourseEntry] });
      const app = buildApp(query);
      const res = await request(app)
        .post(`/api/academic-plans/${mockPlanId}/courses`)
        .send({ course_id: mockCourseId, planned_term_semester: 'Fall', planned_term_year: 2025 });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.courseEntry).toEqual(mockCourseEntry);
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('should return 500 if database operation fails', async () => {
      const query = vi.fn().mockRejectedValue(new Error('DB error'));
      const app = buildApp(query);
      const res = await request(app)
        .post(`/api/academic-plans/${mockPlanId}/courses`)
        .send({ course_id: mockCourseId, planned_term_semester: 'Fall', planned_term_year: 2025 });

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('DELETE /api/academic-plans/courses/:planCourseId', () => {
    it('should remove a course from an academic plan', async () => {
      const mockPlanCourseId = 1;
      const query = vi.fn().mockResolvedValueOnce({ rowCount: 1 });
      const app = buildApp(query);
      const res = await request(app).delete(`/api/academic-plans/courses/${mockPlanCourseId}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.message).toBe('Course removed from plan successfully');
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('should return 500 if database operation fails', async () => {
      const mockPlanCourseId = 1;
      const query = vi.fn().mockRejectedValue(new Error('DB error'));
      const app = buildApp(query);
      const res = await request(app).delete(`/api/academic-plans/courses/${mockPlanCourseId}`);

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/academic-plans/:planId/validate', () => {
    it('should return validation results for an academic plan', async () => {
      const mockValidationResult = { planId: mockPlanId, isValid: true, issues: [] };
      const query = vi.fn().mockResolvedValueOnce({ rows: [] }); // Placeholder for model's internal queries
      const app = buildApp(query);
      const res = await request(app).get(`/api/academic-plans/${mockPlanId}/validate`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.validationResult).toEqual(mockValidationResult);
    });

    it('should return 500 if database operation fails', async () => {
      const query = vi.fn().mockRejectedValue(new Error('DB error'));
      const app = buildApp(query);
      const res = await request(app).get(`/api/academic-plans/${mockPlanId}/validate`);

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('POST /api/academic-plans/auto-generate', () => {
    it('should auto-generate an academic plan', async () => {
      const mockGeneratedPlan = {
        plan_id: mockPlanId,
        student_user_id: mockStudentUserId,
        plan_name: 'Auto-Generated Plan',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        grad_term_semester: 'Fall',
        grad_term_year: 2027,
        workload_limits: null,
      };
      const query = vi.fn().mockResolvedValueOnce({ rows: [mockGeneratedPlan] });
      const app = buildApp(query);
      const res = await request(app)
        .post('/api/academic-plans/auto-generate')
        .send({ student_user_id: mockStudentUserId, preferences: { grad_term_year: 2027 } });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.plan).toEqual(mockGeneratedPlan);
    });

    it('should return 500 if database operation fails', async () => {
      const query = vi.fn().mockRejectedValue(new Error('DB error'));
      const app = buildApp(query);
      const res = await request(app)
        .post('/api/academic-plans/auto-generate')
        .send({ student_user_id: mockStudentUserId, preferences: {} });

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBeDefined();
    });
  });
});
