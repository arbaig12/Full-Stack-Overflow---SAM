/**
 * @file registrationHoldRoutes.js
 * @description This file defines the Express router for managing student registration holds.
 * It provides endpoints for retrieving, placing, and removing registration holds.
 * @requires express - Fast, unopinionated, minimalist web framework for Node.js.
 * @requires ./registrationHoldModel.js - The model functions for the Registration Hold concept.
 */

import { Router } from 'express';
import { getStudentHolds, placeHold, removeHold } from './registrationHoldModel.js';

const router = Router();

/**
 * @route GET /api/registration-holds/:studentId
 * @description Retrieves all active registration holds for a specific student.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The route parameters.
 * @param {string} req.params.studentId - The ID of the student whose holds are to be retrieved.
 * @returns {object} 200 - A success response with a list of the student's registration holds.
 * @returns {object} 500 - An error response if the database query fails.
 */
router.get('/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const holds = await getStudentHolds(req.db, studentId);
    return res.json({ ok: true, holds });
  } catch (e) {
    console.error(`[RegistrationHold] GET /:studentId failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * @route POST /api/registration-holds
 * @description Places a new registration hold on a student's account.
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body, containing the new hold details.
 * @param {number} req.body.student_id - The ID of the student to place the hold on.
 * @param {string} req.body.hold_type - The type of hold (e.g., 'Academic', 'Financial').
 * @param {string} [req.body.note] - An optional note for the hold.
 * @returns {object} 201 - A success response with the newly created registration hold.
 * @returns {object} 500 - An error response if the database insertion fails.
 */
router.post('/', async (req, res) => {
  try {
    // Assuming placed_by_user_id is provided in the request body for now.
    // In a real application, this would likely come from an authenticated user's session (e.g., req.user.id).
    const { student_user_id, hold_type, note, placed_by_user_id } = req.body;
    const hold = await placeHold(req.db, { student_user_id, hold_type, note, placed_by_user_id });
    return res.status(201).json({ ok: true, hold });
  } catch (e) {
    console.error(`[RegistrationHold] POST / failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * @route DELETE /api/registration-holds/:holdId
 * @description Removes an existing registration hold from a student's account.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The route parameters.
 * @param {string} req.params.holdId - The ID of the hold to remove.
 * @returns {object} 200 - A success response indicating the hold was removed.
 * @returns {object} 500 - An error response if the database deletion fails.
 */
router.delete('/:holdId', async (req, res) => {
  try {
    const { holdId } = req.params;
    await removeHold(req.db, holdId);
    return res.json({ ok: true, message: 'Hold removed successfully' });
  } catch (e) {
    console.error(`[RegistrationHold] DELETE /:holdId failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * @route PUT /api/registration-holds/:holdId/resolve
 * @description Resolves an existing registration hold.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The route parameters.
 * @param {string} req.params.holdId - The ID of the hold to resolve.
 * @param {object} req.body - The request body.
 * @param {number} req.body.resolved_by_user_id - The ID of the user resolving the hold.
 * @returns {object} 200 - A success response with the updated hold.
 * @returns {object} 404 - If the hold is not found.
 * @returns {object} 500 - An error response if the database update fails.
 */
router.put('/:holdId/resolve', async (req, res) => {
  try {
    const { holdId } = req.params;
    // In a real application, resolved_by_user_id would likely come from req.user.id
    const { resolved_by_user_id } = req.body;
    if (!resolved_by_user_id) {
      return res.status(400).json({ ok: false, error: 'resolved_by_user_id is required' });
    }
    const updatedHold = await resolveHold(req.db, holdId, resolved_by_user_id);
    if (!updatedHold) {
      return res.status(404).json({ ok: false, error: 'Hold not found' });
    }
    return res.json({ ok: true, hold: updatedHold });
  } catch (e) {
    console.error(`[RegistrationHold] PUT /:holdId/resolve failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
