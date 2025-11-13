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
    const hold = await placeHold(req.db, req.body);
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

export default router;
