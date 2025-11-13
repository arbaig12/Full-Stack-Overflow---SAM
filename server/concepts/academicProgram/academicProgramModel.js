/**
 * @file academicProgramModel.js
 * @description Defines the data model for the Academic Program concept.
 */

/**
 * Retrieves all academic programs for a student.
 * @param {object} db - The database connection object.
 * @param {number} studentId - The ID of the student to retrieve the programs for.
 * @returns {Promise<Array>} - A promise that resolves to an array of academic program objects.
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
 * Declares a major/minor for a student.
 * @param {object} db - The database connection object.
 * @param {object} program - The program object to create.
 * @returns {Promise<object>} - A promise that resolves to the newly created academic program object.
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
 * Updates a major/minor for a student.
 * @param {object} db - The database connection object.
 * @param {number} programId - The ID of the program to update.
 * @param {object} program - The program object to update.
 * @returns {Promise<object>} - A promise that resolves to the updated academic program object.
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
