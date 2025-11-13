/**
 * @file academicProgramModel.js
 * @description This file defines the data model and database interactions for the Academic Program concept.
 * It includes functions for retrieving, declaring, and updating a student's declared majors and minors.
 */

/**
 * Retrieves all academic programs (majors, minors) associated with a specific student.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} studentId - The unique identifier for the student.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of academic program objects.
 * Each object contains details about a program the student has declared.
 * @example
 * // Returns:
 * // [
 * //   { program_id: 1, subject: 'CSE', degree_type: 'BS', program_type: 'Major', major_requirement_version: 'Fall 2022' },
 * //   { program_id: 5, subject: 'MAT', degree_type: 'N/A', program_type: 'Minor', major_requirement_version: null }
 * // ]
 */
export async function getStudentPrograms(db, studentId) {
  const sql = `
    SELECT
      p.program_id,
      p.subject,
      p.degree_type,
      p.program_type,
      sp.major_requirement_version
    FROM student_programs sp
    JOIN programs p ON p.program_id = sp.program_id
    WHERE sp.student_id = $1
  `;
  const { rows } = await db.query(sql, [studentId]);
  return rows;
}

/**
 * Creates a new association between a student and an academic program (i.e., declares a major or minor).
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {object} program - The program declaration details.
 * @param {number} program.student_id - The ID of the student declaring the program.
 * @param {number} program.program_id - The ID of the program being declared.
 * @param {string} program.major_requirement_version - The requirement version for the major (e.g., "Fall 2022").
 * @returns {Promise<object>} A promise that resolves to the newly created student-program association object.
 */
export async function declareProgram(db, program) {
  const { student_id, program_id, major_requirement_version } = program;
  const sql = `
    INSERT INTO student_programs (student_id, program_id, major_requirement_version)
    VALUES ($1, $2, $3)
    RETURNING student_id, program_id, major_requirement_version
  `;
  const { rows } = await db.query(sql, [student_id, program_id, major_requirement_version]);
  return rows[0];
}

/**
 * Updates an existing student-program association, typically to change the requirement version.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} programId - The unique identifier of the student-program association to update.
 * @param {object} program - An object containing the fields to update.
 * @param {string} program.major_requirement_version - The new requirement version for the program.
 * @returns {Promise<object>} A promise that resolves to the updated student-program association object.
 */
export async function updateProgram(db, programId, program) {
  const { major_requirement_version } = program;
  const sql = `
    UPDATE student_programs
    SET major_requirement_version = $1
    WHERE program_id = $2
    RETURNING student_id, program_id, major_requirement_version
  `;
  const { rows } = await db.query(sql, [major_requirement_version, programId]);
  return rows[0];
}
