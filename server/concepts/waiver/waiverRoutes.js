/**
 * @file waiverRoutes.js
 * @description This file defines the Express router for managing academic waivers.
 * It provides endpoints for retrieving, creating, and revoking waivers for students.
 * @requires express - Fast, unopinionated, minimalist web framework for Node.js.
 * @requires ./waiverModel.js - The model functions for the Waiver concept.
 */

import { Router } from 'express';
import { getStudentWaivers, createWaiver, revokeWaiver } from './waiverModel.js';

const router = Router();

/**
 * @route GET /api/waivers/:studentId
 * @description Retrieves all academic waivers for a specific student.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The route parameters.
 * @param {string} req.params.studentId - The ID of the student whose waivers are to be retrieved.
 * @returns {object} 200 - A success response with a list of the student's waivers.
 * @returns {object} 500 - An error response if the database query fails.
 */
router.get('/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const waivers = await getStudentWaivers(req.db, studentId);
    return res.json({ ok: true, waivers });
  } catch (e) {
    console.error(`[Waiver] GET /:studentId failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * @route POST /api/waivers
 * @description Creates a new academic waiver for a student.
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body, containing the new waiver details.
 * @param {number} req.body.student_id - The ID of the student for whom the waiver is granted.
 * @param {string} req.body.waiver_type - The type of waiver (e.g., 'Prerequisite', 'Time Conflict').
 * @param {string} [req.body.note] - An optional note for the waiver.
 * @returns {object} 201 - A success response with the newly created waiver.
 * @returns {object} 500 - An error response if the database insertion fails.
 */
router.post('/', async (req, res) => {
  try {
    // Assuming granted_by_user_id is provided in the request body for now.
    // In a real application, this would likely come from an authenticated user's session (e.g., req.user.id).
    const { student_user_id, waiver_type, related_entity_id, related_entity_type, description, granted_by_user_id, expires_at } = req.body;
    const waiver = await createWaiver(req.db, { student_user_id, waiver_type, related_entity_id, related_entity_type, description, granted_by_user_id, expires_at });
    return res.status(201).json({ ok: true, waiver });
  } catch (e) {
    console.error(`[Waiver] POST / failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * @route DELETE /api/waivers/:waiverId
 * @description Revokes (deletes) an existing academic waiver.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The route parameters.
 * @param {string} req.params.waiverId - The ID of the waiver to revoke.
 * @returns {object} 200 - A success response indicating the waiver was revoked.
 * @returns {object} 500 - An error response if the database deletion fails.
 */
router.delete('/:waiverId', async (req, res) => {
  try {
    const { waiverId } = req.params;
    await revokeWaiver(req.db, waiverId);
    return res.json({ ok: true, message: 'Waiver revoked successfully' });
  } catch (e) {
    console.error(`[Waiver] DELETE /:waiverId failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
