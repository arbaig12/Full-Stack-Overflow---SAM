import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import app from '../index.js'; // Assuming your Express app is exported from index.js
import { Pool } from 'pg'; // Import Pool to mock it

// Mock the database pool
const mockQuery = vi.fn();
vi.mock('pg', () => ({
  Pool: vi.fn(() => ({
    query: mockQuery,
    on: vi.fn(),
    end: vi.fn(),
  })),
}));

// Mock external model dependencies for academicPlanModel
vi.mock('../concepts/studentProfile/studentProfileModel.js', () => ({
  getStudentProfile: vi.fn(),
}));
vi.mock('../concepts/degreeRequirement/degreeRequirementModel.js', () => ({
  checkDegreeRequirements: vi.fn(),
  getDegreeRequirements: vi.fn(),
}));
vi.mock('../concepts/courseCatalog/courseCatalogModel.js', () => ({
  getCourseInfo: vi.fn(),
}));

// Mock the auth middleware for testing purposes
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { user_id: 1, role: 'Student' }; // Mock authenticated student
    next();
  },
  authorizeRoles: (roles) => (req, res, next) => {
    if (roles.includes(req.user.role)) {
      next();
    } else {
      res.status(403).json({ ok: false, error: 'Access forbidden: Insufficient permissions.' });
    }
  },
}));


describe('Academic Plan API Endpoints', () => {
  let server;
  let createdPlanId;

  beforeAll(async () => {
    server = app.listen(4001); // Use a different port for testing
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    mockQuery.mockReset();
    // Reset mocks for external dependencies
    require('../concepts/studentProfile/studentProfileModel.js').getStudentProfile.mockReset();
    require('../concepts/degreeRequirement/degreeRequirementModel.js').checkDegreeRequirements.mockReset();
    require('../concepts/degreeRequirement/degreeRequirementModel.js').getDegreeRequirements.mockReset();
    require('../concepts/courseCatalog/courseCatalogModel.js').getCourseInfo.mockReset();
  });

  it('POST /api/academic-plans should create a new academic plan', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        plan_id: 1,
        student_user_id: 1,
        plan_name: 'My First Plan',
        grad_term_semester: 'Fall',
        grad_term_year: 2028,
        workload_limits: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }],
    });

    const response = await request(server)
      .post('/api/academic-plans')
      .send({
        studentUserId: 1,
        planName: 'My First Plan',
        preferences: {
          grad_term_semester: 'Fall',
          grad_term_year: 2028,
        },
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.ok).toBe(true);
    expect(response.body.plan).toHaveProperty('plan_id', 1);
    createdPlanId = response.body.plan.plan_id;
  });

  it('GET /api/academic-plans/:planId should retrieve an academic plan', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        plan_id: createdPlanId,
        student_user_id: 1,
        plan_name: 'My First Plan',
        grad_term_semester: 'Fall',
        grad_term_year: 2028,
        workload_limits: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }],
    }).mockResolvedValueOnce({
      rows: [], // No courses in the plan yet
    });

    const response = await request(server).get(`/api/academic-plans/${createdPlanId}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.plan).toHaveProperty('plan_id', createdPlanId);
    expect(response.body.plan).toHaveProperty('courses', []);
  });

  it('POST /api/academic-plans/:planId/validate should validate an academic plan', async () => {
    // Mock getAcademicPlan
    mockQuery.mockResolvedValueOnce({
      rows: [{
        plan_id: createdPlanId,
        student_user_id: 1,
        plan_name: 'My First Plan',
        grad_term_semester: 'Fall',
        grad_term_year: 2028,
        workload_limits: { 'Fall 2025': 15 },
      }],
    }).mockResolvedValueOnce({
      rows: [{
        plan_course_id: 101,
        course_id: 1, // Assuming course_id is numeric
        subject: 'CSE',
        course_num: '101',
        name: 'Intro to CS',
        planned_term_semester: 'Fall',
        planned_term_year: 2025,
        credits: 3,
      }, {
        plan_course_id: 102,
        course_id: 2, // Assuming course_id is numeric
        subject: 'CSE',
        course_num: '102',
        name: 'Web Design',
        planned_term_semester: 'Fall',
        planned_term_year: 2025,
        credits: 15, // This will exceed workload limit
      }],
    });

    // Mock getStudentProfile
    require('../concepts/studentProfile/studentProfileModel.js').getStudentProfile.mockResolvedValue({
      user_id: 1,
      classes: [], // No completed classes
      academic_programs: [{
        subject: 'CSE',
        degree_type: 'BS',
      }],
    });

    // Mock getCourseInfo
    require('../concepts/courseCatalog/courseCatalogModel.js').getCourseInfo.mockImplementation((db, subject, num, semester, year) => {
      if (subject === 'CSE' && num === '101') return { course_id: 1, subject: 'CSE', course_num: '101', credits: 3, prereq_rules: [] };
      if (subject === 'CSE' && num === '102') return { course_id: 2, subject: 'CSE', course_num: '102', credits: 15, prereq_rules: [{ type: 'courses', courses: [{ subject: 'CSE', course_num: '101' }] }] };
      return null;
    });

    // Mock getDegreeRequirements
    require('../concepts/degreeRequirement/degreeRequirementModel.js').getDegreeRequirements.mockResolvedValue({
      id: 1,
      subject: 'CSE',
      degree_type: 'BS',
      degree_requirements: {
        required_courses: [{ subject: 'CSE', number: '101', credits: 3 }],
        minimum_credits: 120,
      },
    });

    // Mock checkDegreeRequirements
    require('../concepts/degreeRequirement/degreeRequirementModel.js').checkDegreeRequirements.mockResolvedValue({
      status: 'unsatisfied',
      details: {
        requiredCourses: [{ subject: 'CSE', number: '101', satisfied: false }],
        overallCredits: 0,
      },
    });

    const response = await request(server).get(`/api/academic-plans/${createdPlanId}/validate`);

    expect(response.statusCode).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.validationResult.isValid).toBe(false);
    expect(response.body.validationResult.issues.length).toBeGreaterThan(0);
    expect(response.body.validationResult.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'warning', message: expect.stringContaining('Workload for Fall 2025') }),
        expect.objectContaining({ type: 'error', message: expect.stringContaining('Prerequisites not met for CSE 102') }),
        expect.objectContaining({ type: 'error', message: expect.stringContaining('Degree requirements for CSE BS are not satisfied by the plan.') }),
        expect.objectContaining({ type: 'info', message: expect.stringContaining('Time conflict validation is not yet implemented.') }),
      ])
    );
  });

  it('POST /api/academic-plans/auto-generate should auto-generate an academic plan', async () => {
    // Mock getStudentProfile
    require('../concepts/studentProfile/studentProfileModel.js').getStudentProfile.mockResolvedValue({
      user_id: 1,
      classes: [], // No completed classes
      academic_programs: [{
        subject: 'CSE',
        degree_type: 'BS',
      }],
    });

    // Mock getDegreeRequirements
    require('../concepts/degreeRequirement/degreeRequirementModel.js').getDegreeRequirements.mockResolvedValue({
      id: 1,
      subject: 'CSE',
      degree_type: 'BS',
      degree_requirements: {
        required_courses: [{ subject: 'CSE', number: '101', credits: 3 }],
        minimum_credits: 120,
      },
    });

    // Mock checkDegreeRequirements to return unsatisfied for CSE 101
    require('../concepts/degreeRequirement/degreeRequirementModel.js').checkDegreeRequirements.mockResolvedValue({
      status: 'unsatisfied',
      details: {
        requiredCourses: [{ subject: 'CSE', number: '101', satisfied: false, credits: 3 }],
        overallCredits: 0,
      },
    });

    // Mock getCourseInfo
    require('../concepts/courseCatalog/courseCatalogModel.js').getCourseInfo.mockResolvedValue({
      course_id: 1, subject: 'CSE', course_num: '101', credits: 3, prereq_rules: []
    });

    // Mock createAcademicPlan and addCourseToAcademicPlan
    mockQuery.mockResolvedValueOnce({ // createAcademicPlan
      rows: [{
        plan_id: 2,
        student_user_id: 1,
        plan_name: 'Auto-Generated Plan',
        grad_term_semester: 'Fall',
        grad_term_year: 2025,
        workload_limits: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }],
    }).mockResolvedValueOnce({ // addCourseToAcademicPlan
      rows: [{
        plan_course_id: 201,
        plan_id: 2,
        course_id: 1,
        planned_term_semester: 'Fall',
        planned_term_year: 2025,
      }],
    }).mockResolvedValueOnce({ // getAcademicPlan (final fetch)
      rows: [{
        plan_id: 2,
        student_user_id: 1,
        plan_name: 'Auto-Generated Plan',
        grad_term_semester: 'Fall',
        grad_term_year: 2025,
        workload_limits: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }],
    }).mockResolvedValueOnce({ // getAcademicPlan (final fetch courses)
      rows: [{
        plan_course_id: 201,
        course_id: 1,
        subject: 'CSE',
        course_num: '101',
        name: 'Intro to CS',
        planned_term_semester: 'Fall',
        planned_term_year: 2025,
      }],
    });


    const response = await request(server)
      .post('/api/academic-plans/auto-generate')
      .send({
        studentUserId: 1,
        preferences: {
          grad_term_semester: 'Fall',
          grad_term_year: 2028,
        },
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.plan).toHaveProperty('plan_id', 2);
    expect(response.body.plan.courses.length).toBeGreaterThan(0);
    expect(response.body.plan.courses[0].course_num).toBe('101');
  });
});