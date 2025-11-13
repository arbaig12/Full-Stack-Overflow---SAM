/**
 * @file waitlistRoutes.js
 * @description This file defines the Express router for managing class waitlists.
 * It provides endpoints for adding students to a waitlist, removing them, and retrieving waitlist information.
 */

import { Router } from 'express';
import { addToWaitlist, removeFromWaitlist, getWaitlistByClass, getNextStudentOnWaitlist } from './waitlistModel.js';

const router = Router();

/**
 * @route POST /api/waitlists
 * @description Adds a student to a class's waitlist.
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body.
 * @param {number} req.body.student_user_id - The ID of the student to add.
 * @param {number} req.body.class_section_id - The ID of the class section.
 * @returns {object} 201 - A success response with the new waitlist entry.
 * @returns {object} 500 - An error response if the database operation fails.
 */
router.post('/', async (req, res) => {
  try {
    const { student_user_id, class_section_id } = req.body;
    const entry = await addToWaitlist(req.db, student_user_id, class_section_id);
    return res.status(201).json({ ok: true, entry });
  } catch (e) {
    console.error(`[Waitlist] POST / failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * @route DELETE /api/waitlists/:waitlistEntryId
 * @description Removes a student from a class's waitlist.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The route parameters.
 * @param {string} req.params.waitlistEntryId - The ID of the waitlist entry to remove.
 * @returns {object} 200 - A success response.
 * @returns {object} 500 - An error response if the database operation fails.
 */
router.delete('/:waitlistEntryId', async (req, res) => {
  try {
    const { waitlistEntryId } = req.params;
    await removeFromWaitlist(req.db, waitlistEntryId);
    return res.json({ ok: true, message: 'Waitlist entry removed successfully' });
  } catch (e) {
    console.error(`[Waitlist] DELETE /:waitlistEntryId failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * @route GET /api/waitlists/class/:classSectionId
 * @description Retrieves the entire waitlist for a specific class section.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The route parameters.
 * @param {string} req.params.classSectionId - The ID of the class section.
 * @returns {object} 200 - A success response with the waitlist entries.
 * @returns {object} 500 - An error response if the database operation fails.
 */
router.get('/class/:classSectionId', async (req, res) => {
  try {
    const { classSectionId } = req.params;
    const waitlist = await getWaitlistByClass(req.db, classSectionId);
    return res.json({ ok: true, waitlist });
  } catch (e) {
    console.error(`[Waitlist] GET /class/:classSectionId failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * @route GET /api/waitlists/class/:classSectionId/next
 * @description Retrieves the student at the top of the waitlist for a specific class section.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The route parameters.
 * @param {string} req.params.classSectionId - The ID of the class section.
 * @returns {object} 200 - A success response with the top waitlist entry, or null if empty.
 * @returns {object} 500 - An error response if the database operation fails.
 */
router.get('/class/:classSectionId/next', async (req, res) => {
  try {
    const { classSectionId } = req.params;
    const nextStudent = await getNextStudentOnWaitlist(req.db, classSectionId);
    return res.json({ ok: true, nextStudent });
  } catch (e) {
    console.error(`[Waitlist] GET /class/:classSectionId/next failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
