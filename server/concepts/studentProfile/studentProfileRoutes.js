/**
 * @file studentProfileRoutes.js
 * @description Express routes for managing student profiles.
 */

import { Router } from 'express';
import { getStudentProfile } from './studentProfileModel.js';

const router = Router();

/**
 * GET /:userId
 * Returns the profile for a student.
 *
 * @route GET /:userId
 * @returns {Object} 200 - The student profile object.
 * @returns {Object} 404 - Student not found.
 * @returns {Object} 500 - Query failure.
 */
router.get('/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const profile = await getStudentProfile(req.db, userId);

    if (!profile) {
      return res.status(404).json({ ok: false, error: 'Student not found' });
    }

    return res.json({ ok: true, profile });
  } catch (e) {
    console.error(`[studentProfile] /:userId failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
