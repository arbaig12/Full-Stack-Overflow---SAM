/**
 * @file academicPlanRoutes.js
 * @description This file defines the Express router for managing student academic plans.
 * It provides endpoints for creating, retrieving, updating, and deleting academic plans and their courses.
 */

import { Router } from 'express';
import {
  createAcademicPlan,
  getAcademicPlan,
  updateAcademicPlan,
  deleteAcademicPlan,
  addCourseToAcademicPlan,
  removeCourseFromAcademicPlan,
  validateAcademicPlan,
  autoGenerateAcademicPlan
} from './academicPlanModel.js';

const router = Router();

/**
 * @route POST /api/academic-plans
 * @description Creates a new academic plan for a student.
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body.
 * @param {number} req.body.student_user_id - The ID of the student.
 * @param {string} req.body.plan_name - The name of the academic plan.
 * @param {object} [req.body.preferences] - Optional plan preferences.
 * @returns {object} 201 - A success response with the newly created academic plan.
 * @returns {object} 500 - An error response if the database operation fails.
 */
router.post('/', async (req, res) => {
  try {
    const { student_user_id, plan_name, preferences } = req.body;
    const plan = await createAcademicPlan(req.db, student_user_id, plan_name, preferences);
    return res.status(201).json({ ok: true, plan });
  } catch (e) {
    console.error(`[AcademicPlan] POST / failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * @route GET /api/academic-plans/:planId
 * @description Retrieves an academic plan by its ID, including its planned courses.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The route parameters.
 * @param {string} req.params.planId - The ID of the academic plan.
 * @returns {object} 200 - A success response with the academic plan.
 * @returns {object} 404 - If the plan is not found.
 * @returns {object} 500 - An error response if the database operation fails.
 */
router.get('/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    const plan = await getAcademicPlan(req.db, planId);
    if (!plan) {
      return res.status(404).json({ ok: false, error: 'Academic plan not found' });
    }
    return res.json({ ok: true, plan });
  } catch (e) {
    console.error(`[AcademicPlan] GET /:planId failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * @route PUT /api/academic-plans/:planId
 * @description Updates an existing academic plan's details and preferences.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The route parameters.
 * @param {string} req.params.planId - The ID of the academic plan to update.
 * @param {object} req.body - An object containing fields to update.
 * @returns {object} 200 - A success response with the updated academic plan.
 * @returns {object} 404 - If the plan is not found.
 * @returns {object} 500 - An error response if the database operation fails.
 */
router.put('/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    const updatedPlan = await updateAcademicPlan(req.db, planId, req.body);
    if (!updatedPlan) {
      return res.status(404).json({ ok: false, error: 'Academic plan not found' });
    }
    return res.json({ ok: true, plan: updatedPlan });
  } catch (e) {
    console.error(`[AcademicPlan] PUT /:planId failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * @route DELETE /api/academic-plans/:planId
 * @description Deletes an academic plan and all its associated courses.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The route parameters.
 * @param {string} req.params.planId - The ID of the academic plan to delete.
 * @returns {object} 200 - A success response.
 * @returns {object} 500 - An error response if the database operation fails.
 */
router.delete('/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    await deleteAcademicPlan(req.db, planId);
    return res.json({ ok: true, message: 'Academic plan deleted successfully' });
  } catch (e) {
    console.error(`[AcademicPlan] DELETE /:planId failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * @route POST /api/academic-plans/:planId/courses
 * @description Adds a course to an academic plan.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The route parameters.
 * @param {string} req.params.planId - The ID of the academic plan.
 * @param {object} req.body - The request body.
 * @param {number} req.body.course_id - The ID of the course to add.
 * @param {string} req.body.planned_term_semester - The planned semester.
 * @param {number} req.body.planned_term_year - The planned year.
 * @returns {object} 201 - A success response with the new course entry.
 * @returns {object} 500 - An error response if the database operation fails.
 */
router.post('/:planId/courses', async (req, res) => {
  try {
    const { planId } = req.params;
    const { course_id, planned_term_semester, planned_term_year } = req.body;
    const courseEntry = await addCourseToAcademicPlan(req.db, planId, course_id, planned_term_semester, planned_term_year);
    return res.status(201).json({ ok: true, courseEntry });
  } catch (e) {
    console.error(`[AcademicPlan] POST /:planId/courses failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * @route DELETE /api/academic-plans/courses/:planCourseId
 * @description Removes a course from an academic plan.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The route parameters.
 * @param {string} req.params.planCourseId - The ID of the academic plan course entry to remove.
 * @returns {object} 200 - A success response.
 * @returns {object} 500 - An error response if the database operation fails.
 */
router.delete('/courses/:planCourseId', async (req, res) => {
  try {
    const { planCourseId } = req.params;
    await removeCourseFromAcademicPlan(req.db, planCourseId);
    return res.json({ ok: true, message: 'Course removed from plan successfully' });
  } catch (e) {
    console.error(`[AcademicPlan] DELETE /courses/:planCourseId failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * @route GET /api/academic-plans/:planId/validate
 * @description Validates an academic plan against requirements. (Placeholder)
 * @param {object} req - The Express request object.
 * @param {object} req.params - The route parameters.
 * @param {string} req.params.planId - The ID of the academic plan to validate.
 * @returns {object} 200 - A success response with validation results.
 * @returns {object} 500 - An error response.
 */
router.get('/:planId/validate', async (req, res) => {
  try {
    const { planId } = req.params;
    const validationResult = await validateAcademicPlan(req.db, planId);
    return res.json({ ok: true, validationResult });
  } catch (e) {
    console.error(`[AcademicPlan] GET /:planId/validate failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * @route POST /api/academic-plans/auto-generate
 * @description Automatically generates an academic plan for a student. (Placeholder)
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body.
 * @param {number} req.body.student_user_id - The ID of the student.
 * @param {object} req.body.preferences - Student's planning preferences.
 * @returns {object} 201 - A success response with the auto-generated plan.
 * @returns {object} 500 - An error response.
 */
router.post('/auto-generate', async (req, res) => {
  try {
    const { student_user_id, preferences } = req.body;
    const newPlan = await autoGenerateAcademicPlan(req.db, student_user_id, preferences);
    return res.status(201).json({ ok: true, plan: newPlan });
  } catch (e) {
    console.error(`[AcademicPlan] POST /auto-generate failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
