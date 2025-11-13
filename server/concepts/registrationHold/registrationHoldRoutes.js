/**
 * @file registrationHoldRoutes.js
 * @description Express routes for managing registration holds.
 */

import { Router } from 'express';
import { getStudentHolds, placeHold, removeHold } from './registrationHoldModel.js';

const router = Router();

/**
 * GET /:studentId
 * Returns all registration holds for a student.
 *
 * @route GET /:studentId
 * @returns {Object} 200 - A list of registration holds.
 * @returns {Object} 500 - Query failure.
 */
router.get('/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const holds = await getStudentHolds(req.db, studentId);
    return res.json({ ok: true, holds });
  } catch (e) {
    console.error(`[registrationHold] /:studentId failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /
 * Places a registration hold on a student's account.
 *
 * @route POST /
 * @returns {Object} 201 - The newly created registration hold.
 * @returns {Object} 500 - Query failure.
 */
router.post('/', async (req, res) => {
  try {
    const hold = await placeHold(req.db, req.body);
    return res.status(201).json({ ok: true, hold });
  } catch (e) {
    console.error(`[registrationHold] / failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * DELETE /:holdId
 * Removes a registration hold from a student's account.
 *
 * @route DELETE /:holdId
 * @returns {Object} 200 - A success message.
 * @returns {Object} 500 - Query failure.
 */
router.delete('/:holdId', async (req, res) => {
  try {
    const { holdId } = req.params;
    await removeHold(req.db, holdId);
    return res.json({ ok: true, message: 'Hold removed successfully' });
  } catch (e) {
    console.error(`[registrationHold] /:holdId failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
