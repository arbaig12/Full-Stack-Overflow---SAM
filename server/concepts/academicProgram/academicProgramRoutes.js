/**
 * @file academicProgramRoutes.js
 * @description Express routes for managing academic programs.
 */

import { Router } from 'express';
import { getStudentPrograms, declareProgram, updateProgram } from './academicProgramModel.js';

const router = Router();

/**
 * GET /:studentId
 * Returns all academic programs for a student.
 *
 * @route GET /:studentId
 * @returns {Object} 200 - A list of academic programs.
 * @returns {Object} 500 - Query failure.
 */
router.get('/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const programs = await getStudentPrograms(req.db, studentId);
    return res.json({ ok: true, programs });
  } catch (e) {
    console.error(`[academicProgram] /:studentId failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /
 * Declares a major/minor for a student.
 *
 * @route POST /
 * @returns {Object} 201 - The newly created academic program.
 * @returns {Object} 500 - Query failure.
 */
router.post('/', async (req, res) => {
  try {
    const program = await declareProgram(req.db, req.body);
    return res.status(201).json({ ok: true, program });
  } catch (e) {
    console.error(`[academicProgram] / failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * PUT /:programId
 * Updates a major/minor for a student.
 *
 * @route PUT /:programId
 * @returns {Object} 200 - The updated academic program.
 * @returns {Object} 500 - Query failure.
 */
router.put('/:programId', async (req, res) => {
  try {
    const { programId } = req.params;
    const program = await updateProgram(req.db, programId, req.body);
    return res.json({ ok: true, program });
  } catch (e) {
    console.error(`[academicProgram] /:programId failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
