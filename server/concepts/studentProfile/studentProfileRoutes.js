/**
 * @file studentProfileRoutes.js
 * @description This file defines the Express router for the Student Profile concept.
 * It provides an API endpoint for retrieving a comprehensive student profile.
 * @requires express - Fast, unopinionated, minimalist web framework for Node.js.
 * @requires ./studentProfileModel.js - The model functions for the Student Profile concept.
 */

import { Router } from 'express';
import { getStudentProfile } from './studentProfileModel.js';

const router = Router();

/**
 * @route GET /api/student-profile/:userId
 * @description Retrieves a comprehensive profile for a specific student.
 * The profile includes personal details, academic history, calculated GPA and class standing,
 * as well as associated academic programs, registration holds, and waivers.
 *
 * @param {object} req - The Express request object.
 * @param {object} req.params - The route parameters.
 * @param {string} req.params.userId - The unique identifier (user_id) of the student.
 *
 * @returns {object} 200 - A success response with the student's comprehensive profile object.
 * @returns {object} 404 - An error response if no student is found for the given `userId`.
 * @returns {object} 500 - An error response if a server-side issue occurs during data retrieval.
 */
router.get('/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10); // Ensure userId is an integer
    const profile = await getStudentProfile(req.db, userId);

    if (!profile) {
      // If getStudentProfile returns null, the student was not found
      return res.status(404).json({ ok: false, error: 'Student not found' });
    }

    return res.json({ ok: true, profile });
  } catch (e) {
    console.error(`[StudentProfile] GET /:userId failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
