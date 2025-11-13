/**
 * @file waiverRoutes.js
 * @description Express routes for managing waivers.
 */

import { Router } from 'express';
import { getStudentWaivers, createWaiver, revokeWaiver } from './waiverModel.js';

const router = Router();

/**
 * GET /:studentId
 * Returns all waivers for a student.
 *
 * @route GET /:studentId
 * @returns {Object} 200 - A list of waivers.
 * @returns {Object} 500 - Query failure.
 */
router.get('/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const waivers = await getStudentWaivers(req.db, studentId);
    return res.json({ ok: true, waivers });
  } catch (e) {
    console.error(`[waiver] /:studentId failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /
 * Creates a waiver for a student.
 *
 * @route POST /
 * @returns {Object} 201 - The newly created waiver.
 * @returns {Object} 500 - Query failure.
 */
router.post('/', async (req, res) => {
  try {
    const waiver = await createWaiver(req.db, req.body);
    return res.status(201).json({ ok: true, waiver });
  } catch (e) {
    console.error(`[waiver] / failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * DELETE /:waiverId
 * Revokes a waiver.
 *
 * @route DELETE /:waiverId
 * @returns {Object} 200 - A success message.
 * @returns {Object} 500 - Query failure.
 */
router.delete('/:waiverId', async (req, res) => {
  try {
    const { waiverId } = req.params;
    await revokeWaiver(req.db, waiverId);
    return res.json({ ok: true, message: 'Waiver revoked successfully' });
  } catch (e) {
    console.error(`[waiver] /:waiverId failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
