/**
 * @file waiverModel.js
 * @description Defines the data model for the Waiver concept.
 */

/**
 * Retrieves all waivers for a student.
 * @param {object} db - The database connection object.
 * @param {number} studentId - The ID of the student to retrieve the waivers for.
 * @returns {Promise<Array>} - A promise that resolves to an array of waiver objects.
 */
export async function getStudentWaivers(db, studentId) {
  const sql = `
    SELECT
      waiver_id,
      student_id,
      waiver_type,
      note
    FROM waivers
    WHERE student_id = $1
  `;
  const { rows } = await db.query(sql, [studentId]);
  return rows;
}

/**
 * Creates a waiver for a student.
 * @param {object} db - The database connection object.
 * @param {object} waiver - The waiver object to create.
 * @returns {Promise<object>} - A promise that resolves to the newly created waiver object.
 */
export async function createWaiver(db, waiver) {
  const { student_id, waiver_type, note } = waiver;
  const sql = `
    INSERT INTO waivers (student_id, waiver_type, note)
    VALUES ($1, $2, $3)
    RETURNING waiver_id, student_id, waiver_type, note
  `;
  const { rows } = await db.query(sql, [student_id, waiver_type, note]);
  return rows[0];
}

/**
 * Revokes a waiver.
 * @param {object} db - The database connection object.
 * @param {number} waiverId - The ID of the waiver to revoke.
 * @returns {Promise<void>}
 */
export async function revokeWaiver(db, waiverId) {
  const sql = `
    DELETE FROM waivers
    WHERE waiver_id = $1
  `;
  await db.query(sql, [waiverId]);
}
