/**
 * @file academicProgramRoutes.js
 * @description This file defines the Express router for managing a student's academic programs (majors/minors).
 * It provides endpoints for viewing, declaring, and updating academic programs.
 * @requires express - Fast, unopinionated, minimalist web framework for Node.js.
 * @requires ./academicProgramModel.js - The model functions for the Academic Program concept.
 */

import { Router } from 'express';
import { getStudentPrograms, declareProgram, updateProgram } from './academicProgramModel.js';

const router = Router();

/**
 * @route GET /api/academic-programs/:studentId
 * @description Retrieves all academic programs for a specific student.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The route parameters.
 * @param {string} req.params.studentId - The ID of the student whose programs are to be retrieved.
 * @returns {object} 200 - A success response with a list of the student's academic programs.
 * @returns {object} 500 - An error response if the database query fails.
 */
router.get('/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const programs = await getStudentPrograms(req.db, studentId);
    return res.json({ ok: true, programs });
  } catch (e) {
    console.error(`[AcademicProgram] GET /:studentId failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * @route POST /api/academic-programs
 * @description Declares a new major or minor for a student.
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body, containing the new program details.
 * @param {number} req.body.student_id - The ID of the student.
 * @param {number} req.body.program_id - The ID of the program to declare.
 * @param {string} req.body.major_requirement_version - The requirement version for the program.
 * @returns {object} 201 - A success response with the newly created student-program association.
 * @returns {object} 500 - An error response if the database insertion fails.
 */
router.post('/', async (req, res) => {
  try {
    const program = await declareProgram(req.db, req.body);
    return res.status(201).json({ ok: true, program });
  } catch (e) {
    console.error(`[AcademicProgram] POST / failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * @route PUT /api/academic-programs/:programId
 * @description Updates an existing academic program for a student, such as changing the requirement version.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The route parameters.
 * @param {string} req.params.programId - The ID of the student-program association to update.
 * @param {object} req.body - The request body, containing the fields to update.
 * @param {string} req.body.major_requirement_version - The new requirement version.
 * @returns {object} 200 - A success response with the updated student-program association.
 * @returns {object} 500 - An error response if the database update fails.
 */
router.put('/:programId', async (req, res) => {
  try {
    const { programId } = req.params;
    const program = await updateProgram(req.db, programId, req.body);
    return res.json({ ok: true, program });
  } catch (e) {
    console.error(`[AcademicProgram] PUT /:programId failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
